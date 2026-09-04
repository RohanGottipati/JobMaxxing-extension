export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;
export const PDF_MIME_TYPE = 'application/pdf';
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function documentContentType(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (name.endsWith('.pdf') && (!type || type === PDF_MIME_TYPE)) return PDF_MIME_TYPE;
  if (name.endsWith('.docx') && (!type || type === DOCX_MIME_TYPE)) return DOCX_MIME_TYPE;
  return null;
}

export function validateDocumentFile(file) {
  if (!documentContentType(file)) return 'Choose a PDF or DOCX file.';
  if (!file?.size) return 'The selected file is empty.';
  if (file.size > MAX_DOCUMENT_FILE_SIZE) return 'Files must be 10 MB or smaller.';
  return null;
}

export function safeDocumentFileName(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-+\./g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  return normalized.slice(-120) || 'document';
}

export function applicationPackagePath(userId, fileName, id = crypto.randomUUID()) {
  return `${userId}/application-packages/${id}-${safeDocumentFileName(fileName)}`;
}
