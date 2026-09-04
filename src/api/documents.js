import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config.js';
import { getAuthenticatedSession } from '../auth/session.js';
import {
  applicationPackagePath,
  documentContentType,
  validateDocumentFile,
} from '../document-policy.js';
import { fetchWithNetworkError } from '../network.js';

const DOCUMENT_BUCKET = 'job-documents';
const STORAGE_ORIGIN = SUPABASE_URL.replace(/\/+$/, '');

function storageUrl(path = '') {
  const encodedPath = path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${STORAGE_ORIGIN}/storage/v1/object/${DOCUMENT_BUCKET}${encodedPath ? `/${encodedPath}` : ''}`;
}

async function storageSession() {
  const session = await getAuthenticatedSession();
  if (!session) throw new Error('Authentication is required.');
  return session;
}

export async function uploadApplicationDocument(file, { fetchImpl = globalThis.fetch } = {}) {
  const validationError = validateDocumentFile(file);
  if (validationError) throw new Error(validationError);

  const contentType = documentContentType(file);
  const { accessToken, userId } = await storageSession();
  const path = applicationPackagePath(userId, file.name);
  const response = await fetchWithNetworkError(
    storageUrl(path),
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'cache-control': 'max-age=3600',
        'x-upsert': 'false',
      },
      body: file,
    },
    {
      service: 'Supabase Storage',
      hint: 'Check your connection and try the upload again.',
      fetchImpl,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `Document upload failed (${response.status}).`);
  }
  return {
    path,
    fileName: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
  };
}

export async function removeApplicationDocuments(paths, { fetchImpl = globalThis.fetch } = {}) {
  const prefixes = [...new Set((paths || []).filter(Boolean))];
  if (!prefixes.length) return;
  const { accessToken } = await storageSession();
  await fetchWithNetworkError(
    storageUrl(),
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes }),
    },
    {
      service: 'Supabase Storage',
      hint: 'Unlinked files will be cleaned up when connectivity returns.',
      fetchImpl,
    },
  ).catch(() => {});
}
