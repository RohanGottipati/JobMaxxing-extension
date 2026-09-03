import { APP_URL } from '../../config.js';
import { getAccessToken } from '../auth/session.js';

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication is required.');

  const response = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

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
  return `${APP_URL}/applications?id=${id}${viewParam}`;
}

export function openJobMaxxing(path = '/applications') {
  return chrome.tabs.create({ url: `${APP_URL}${path}` });
}

export function openApplication(id) {
  return openJobMaxxing(`/applications?id=${id}`);
}
