import { APP_URL } from '../../config.js';
import { getAccessToken } from '../auth/session.js';
import { fetchWithNetworkError } from '../network.js';

const API_ORIGIN = APP_URL.replace(/\/+$/, '');

function connectionHint() {
  try {
    const { hostname } = new URL(API_ORIGIN);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return 'Start the JobMaxxing web app with "npm run dev", then try again.';
    }
  } catch {
    // The configured URL is reported by fetchWithNetworkError below.
  }
  return 'Check your connection and APP_URL in config.js, then try again.';
}

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication is required.');

  const response = await fetchWithNetworkError(
    `${API_ORIGIN}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    },
    { service: 'the JobMaxxing API', hint: connectionHint() },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export async function saveApplication(payload) {
  return apiFetch('/api/extension/applications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateApplication(payload) {
  const { id, ...rest } = payload;
  return apiFetch(`/api/extension/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(rest),
  });
}

export async function getApplications({ full = false, limit } = {}) {
  const params = new URLSearchParams();
  if (full) params.set('full', 'true');
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiFetch(`/api/extension/applications${query ? `?${query}` : ''}`);
}

export async function getApplication(id) {
  return apiFetch(`/api/extension/applications/${id}`);
}

export async function deleteApplication(id) {
  return apiFetch(`/api/extension/applications/${id}`, { method: 'DELETE' });
}

export async function wipeAllApplications() {
  return apiFetch('/api/extension/applications', { method: 'DELETE' });
}

export async function analyzeApplication(applicationId, sourceText) {
  return apiFetch(`/api/extension/applications/${applicationId}/analyze`, {
    method: 'POST',
    body: JSON.stringify(sourceText ? { sourceText } : {}),
  });
}

export function applicationUrl(id, view = "overview") {
  const viewParam = view && view !== "overview" ? `&view=${view}` : "";
  return `${API_ORIGIN}/applications?id=${id}${viewParam}`;
}

export function openJobMaxxing(path = '/applications') {
  return chrome.tabs.create({ url: `${API_ORIGIN}${path}` });
}

export function openApplication(id) {
  return openJobMaxxing(`/applications?id=${id}`);
}
