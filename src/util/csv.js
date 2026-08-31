function escape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(apps) {
  const headers = ['title', 'company', 'location', 'appliedAt', 'status', 'sourceHost', 'notes'];
  const rows = [headers.join(',')];
  for (const app of apps) {
    rows.push(headers.map(h => escape(app[h])).join(','));
  }
  return rows.join('\r\n');
}
