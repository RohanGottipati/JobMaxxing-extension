export function canonicalJobUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = (parsed.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    const jobId =
      parsed.searchParams.get('currentJobId') ||
      parsed.searchParams.get('jk') ||
      parsed.searchParams.get('gh_jid') ||
      parsed.searchParams.get('jobId') ||
      parsed.searchParams.get('job_id') ||
      (path.match(/\/jobs\/(?:view\/)?(\d+)/) || [])[1];
    return jobId ? `${host}?job=${jobId}` : `${host}${path}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}

export function findByJobUrl(index, url) {
  const key = canonicalJobUrl(url);
  if (!key) return null;
  return (index || []).find((app) => canonicalJobUrl(app.jobUrl) === key) ?? null;
}
