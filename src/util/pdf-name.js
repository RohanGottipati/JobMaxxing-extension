function capitalizeInitial(value) {
  const characters = Array.from(value);
  if (!characters.length) return '';
  return `${characters[0].toLocaleUpperCase()}${characters.slice(1).join('')}`;
}

function safeNamePart(value) {
  return capitalizeInitial(
    String(value || '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}'-]+/gu, ''),
  );
}

export function defaultMergedPdfName({ fullName = '', email = '' } = {}) {
  const emailName = String(email).split('@', 1)[0].replace(/[._-]+/g, ' ');
  const parts = String(fullName || emailName)
    .trim()
    .split(/\s+/)
    .map(safeNamePart)
    .filter(Boolean);
  const person = parts.length > 1
    ? `${parts[0]}_${parts[parts.length - 1]}`
    : parts[0] || '';

  return `${person ? `${person}_` : ''}Application.pdf`;
}
