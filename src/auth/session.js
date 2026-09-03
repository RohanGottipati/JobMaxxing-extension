import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config.js';

const SESSION_KEY = 'jobmaxxing.session';
const DISPLAY_KEY = 'jobmaxxing.sessionDisplay';

function authHeaders(token) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function storeSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function getStoredSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] ?? null;
}

async function storeSessionDisplay(display) {
  if (!display) {
    await chrome.storage.local.remove(DISPLAY_KEY);
    return;
  }
  await chrome.storage.local.set({ [DISPLAY_KEY]: display });
}

export async function getCachedSessionDisplay() {
  const result = await chrome.storage.local.get(DISPLAY_KEY);
  return result[DISPLAY_KEY] ?? null;
}

export async function getInstantSession() {
  const session = await getStoredSession();
  if (!session?.access_token) return { signedIn: false };

  const cached = await getCachedSessionDisplay();
  const user = session.user;
  const email = cached?.email || user?.email || null;
  const displayName =
    cached?.displayName ||
    formatShortName(
      user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.user_metadata?.display_name,
      email,
    );

  return {
    signedIn: true,
    email,
    displayName,
    cached: Boolean(cached?.displayName),
  };
}

function isExpired(session) {
  if (!session?.expires_at) return true;
  return Date.now() / 1000 > session.expires_at - 60;
}

async function refreshSession(session) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(SUPABASE_ANON_KEY),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) throw new Error('Session expired. Sign in again.');
  const data = await response.json();
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? session.refresh_token,
    expires_at: data.expires_at,
    user: data.user ?? session.user,
  };
  await storeSession(next);
  return next;
}

export async function getAccessToken() {
  const session = await getStoredSession();
  if (!session?.access_token) return null;
  if (!isExpired(session)) return session.access_token;
  try {
    const refreshed = await refreshSession(session);
    return refreshed.access_token;
  } catch {
    await signOut();
    return null;
  }
}

export async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(SUPABASE_ANON_KEY),
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || 'Sign in failed.');
  }
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: data.user,
  };
  await storeSession(session);
  return session;
}

export async function signOut() {
  const session = await getStoredSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: authHeaders(session.access_token),
    }).catch(() => {});
  }
  await chrome.storage.local.remove([SESSION_KEY, DISPLAY_KEY]);
}

export async function getCurrentUser() {
  const token = await getAccessToken();
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    await signOut();
    return null;
  }
  const user = await response.json();
  return user;
}

export function formatShortName(fullName, email) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
  }
  if (parts.length === 1) return parts[0];

  const local = String(email || '').split('@')[0].trim();
  return local || 'Signed in';
}

export async function getSessionDisplay({ refresh = true } = {}) {
  if (!refresh) {
    const instant = await getInstantSession();
    return instant.signedIn ? instant : null;
  }

  const user = await getCurrentUser();
  if (!user) {
    await storeSessionDisplay(null);
    return null;
  }

  let fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.display_name ||
    '';

  if (!fullName) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=full_name&id=eq.${user.id}`,
        { headers: { ...authHeaders(token), Accept: 'application/json' } },
      );
      if (response.ok) {
        const rows = await response.json();
        fullName = rows?.[0]?.full_name || '';
      }
    } catch {
      // Fall back to email local-part.
    }
  }

  const display = {
    email: user.email ?? null,
    displayName: formatShortName(fullName, user.email),
  };
  await storeSessionDisplay(display);
  return display;
}
