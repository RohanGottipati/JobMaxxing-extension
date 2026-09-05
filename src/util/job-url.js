export function canonicalJobUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = (parsed.pathname.replace(/\/+$/, '') || '/').toLowerCase();

    if (
      host === 'dayforcehcm.com' ||
      host.endsWith('.dayforcehcm.com') ||
      host === 'dayforce.com' ||
      host.endsWith('.dayforce.com')
    ) {
      const dayforceMatch = path.match(
        /(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/([^/]+)\/candidateportal\/jobs\/(\d+)/i,
      );
      if (dayforceMatch) {
        return `${host}/${dayforceMatch[1]}?job=${dayforceMatch[2]}`;
      }
    }

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
