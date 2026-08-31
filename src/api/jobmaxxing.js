import { APP_URL } from '../../config.local.js';
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
    const message = data?.error?.message || `Request failed (${response.status})`;
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

export async function getRecentApplications(limit = 10) {
  return apiFetch(`/api/extension/applications?limit=${limit}`);
}

export async function analyzeApplication(applicationId, sourceText) {
  return apiFetch(`/api/extension/applications/${applicationId}/analyze`, {
    method: 'POST',
    body: JSON.stringify(sourceText ? { sourceText } : {}),
  });
}

export function applicationUrl(id) {
  return `${APP_URL}/applications/${id}`;
}

export function openJobMaxxing(path = '/applications') {
  return chrome.tabs.create({ url: `${APP_URL}${path}` });
}
