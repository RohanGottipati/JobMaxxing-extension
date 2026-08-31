import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config.local.js';

const SESSION_KEY = 'jobmaxxing.session';

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
  await chrome.storage.local.remove(SESSION_KEY);
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
