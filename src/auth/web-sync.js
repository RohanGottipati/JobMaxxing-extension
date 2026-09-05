import { APP_URL, SUPABASE_URL } from '../../config.js';
import {
  adoptSession,
  clearLocalSession,
  getSessionDisplay,
  getSessionSource,
  getStoredSession,
} from './session.js';

// The website (JobMaxxing web app) stores its Supabase session in a JS-readable
// cookie named `sb-<project-ref>-auth-token` on its own origin. This module keeps
// the extension and the website in two-way sync:
//   website login  -> extension adopts the cookie session (read side)
//   extension login -> extension writes the cookie so the website logs in (write side)
//   sign-out on either side clears the other.

function projectRef() {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function cookieBase() {
  const ref = projectRef();
  return ref ? `sb-${ref}-auth-token` : null;
}

function isAuthCookieName(name, base) {
  return name === base || name.startsWith(`${base}.`);
}

function chunkIndex(name, base) {
  if (name === base) return 0;
  const n = parseInt(name.slice(base.length + 1), 10);
  return Number.isNaN(n) ? 0 : n;
}

function decodeUtf8(binary) {
  try {
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return binary;
  }
}

// Turn the raw (possibly chunked, base64- or URL-encoded) cookie value into a
// normalized session object, or null if it can't be parsed.
function decodeSession(raw) {
  if (!raw) return null;

  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Leave the raw value as-is if it isn't URL-encoded.
  }

  if (value.startsWith('base64-')) {
    try {
      value = decodeUtf8(atob(value.slice('base64-'.length)));
    } catch {
      return null;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  const s = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!s || !s.access_token) return null;

  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    user: s.user ?? null,
  };
}

function origin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Origins where the website may be running. The production origin comes only
// from config.js so a development placeholder cannot silently become a cookie
// target in a packaged release.
const WEB_ORIGINS = Array.from(
  new Set([origin(APP_URL), 'http://localhost:3000'].filter(Boolean)),
);

// Read and decode the website's Supabase session from its cookies, or null.
// Checks each known web origin and returns the first valid session found.
async function readWebSession() {
  if (!chrome.cookies?.getAll) {
    console.warn('[jm-sync] chrome.cookies unavailable — is the "cookies" permission granted?');
    return null;
  }
  const base = cookieBase();
  if (!base) return null;

  for (const origin of WEB_ORIGINS) {
    let cookies = [];
    try {
      cookies = await chrome.cookies.getAll({ url: origin });
    } catch (error) {
      console.warn('[jm-sync] getAll failed for', origin, error);
      continue;
    }

    const chunks = cookies
      .filter((c) => isAuthCookieName(c.name, base))
      .sort((a, b) => chunkIndex(a.name, base) - chunkIndex(b.name, base));

    if (!chunks.length) continue;

    const session = decodeSession(chunks.map((c) => c.value).join(''));
    if (session?.access_token) {
      console.debug('[jm-sync] found website session at', origin, session.user?.email);
      return session;
    }
    console.warn('[jm-sync] auth cookie present at', origin, 'but could not decode it');
  }

  return null;
}

// --- Write side: push the extension session into the website's cookies ---------

// @supabase/ssr splits long cookie values into ~3180-char chunks named `<base>.0`,
// `<base>.1`, ... and reassembles them on read.
const CHUNK_SIZE = 3180;

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Build the `base64-<json>` cookie value the website expects.
function encodeSessionCookie(session) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    access_token: session.access_token,
    token_type: 'bearer',
    expires_at: session.expires_at ?? null,
    expires_in: session.expires_at ? Math.max(0, session.expires_at - nowSec) : 3600,
    refresh_token: session.refresh_token,
    user: session.user ?? null,
  };
  return `base64-${b64EncodeUtf8(JSON.stringify(payload))}`;
}

function chunkValue(value) {
  if (value.length <= CHUNK_SIZE) return [value];
  const chunks = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  return chunks;
}

async function removeAuthCookies(origin, base) {
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ url: origin });
  } catch {
    return;
  }
  for (const c of cookies) {
    if (isAuthCookieName(c.name, base)) {
      try {
        await chrome.cookies.remove({ url: origin, name: c.name });
      } catch {
        // Ignore — the cookie may already be gone or belong to another store.
      }
    }
  }
}

async function setAuthCookie(origin, name, value, secure) {
  await chrome.cookies.set({
    url: origin,
    name,
    value,
    path: '/',
    secure,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
  });
}

// Write the extension's session into the website's cookies (all known origins) so
// the site becomes logged in too. Clears any stale chunks first.
export async function pushSessionToWeb(session) {
  if (!chrome.cookies?.set || !session?.access_token) return;
  const base = cookieBase();
  if (!base) return;

  const chunks = chunkValue(encodeSessionCookie(session));
  for (const origin of WEB_ORIGINS) {
    const secure = origin.startsWith('https');
    try {
      await removeAuthCookies(origin, base);
      if (chunks.length === 1) {
        await setAuthCookie(origin, base, chunks[0], secure);
      } else {
        for (let i = 0; i < chunks.length; i += 1) {
          await setAuthCookie(origin, `${base}.${i}`, chunks[i], secure);
        }
      }
      console.debug('[jm-sync] pushed session to', origin);
    } catch (error) {
      console.warn('[jm-sync] failed to push session to', origin, error);
    }
  }
}

// Remove the website's session cookies (used when signing out from the extension).
export async function pushSignOutToWeb() {
  if (!chrome.cookies?.getAll) return;
  const base = cookieBase();
  if (!base) return;
  for (const origin of WEB_ORIGINS) {
    await removeAuthCookies(origin, base);
    console.debug('[jm-sync] cleared website session at', origin);
  }
}

let syncing = false;

// Reconcile the extension session with the website session. Adopts the website
// session when present, and clears the extension session when the website has
// signed out (but only if the current extension session came from the website).
export async function syncFromWeb() {
  if (syncing || !chrome.cookies?.getAll) return;
  syncing = true;
  try {
    const web = await readWebSession();
    const stored = await getStoredSession();

    if (web?.access_token) {
      if (stored?.access_token !== web.access_token) {
        console.debug('[jm-sync] adopting website session for', web.user?.email);
        await adoptSession(web);
        // Best-effort profile refresh; never let it clear the session we just
        // adopted (adoptSession already cached a display from the session user).
        await getSessionDisplay().catch(() => {});
      }
      return;
    }

    // No website session.
    if (stored?.access_token) {
      const source = await getSessionSource();
      if (source === 'web') {
        // The website signed out — mirror it.
        console.debug('[jm-sync] website signed out — clearing mirrored session');
        await clearLocalSession();
      } else {
        // The extension has a standalone (popup) session but the website has
        // none — push it so the website logs in too.
        console.debug('[jm-sync] pushing extension session to website');
        await pushSessionToWeb(stored);
      }
    }
  } finally {
    syncing = false;
  }
}

// Register a listener so the extension reacts the moment the website's auth
// cookie changes, and run an initial reconcile at startup.
export function installWebSessionSync() {
  const base = cookieBase();
  if (chrome.cookies?.onChanged && base) {
    chrome.cookies.onChanged.addListener((info) => {
      if (isAuthCookieName(info.cookie?.name || '', base)) {
        void syncFromWeb();
      }
    });
  }
  void syncFromWeb();
}
