const BLOCKED_WEB_STORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
]);

export const UNSCRIPTABLE_TAB = 'UNSCRIPTABLE_TAB';
export const TAB_CHANGED = 'TAB_CHANGED';
export const NOT_JOB_POSTING = 'NOT_JOB_POSTING';

export function captureEligibility(input) {
  let url;
  try {
    url = new URL(String(input || ''));
  } catch {
    return unavailable('Not a job posting');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return unavailable('Not a job posting');
  }

  const host = url.hostname.toLowerCase();
  const isChromeWebStore =
    host === 'chrome.google.com' && url.pathname.toLowerCase().startsWith('/webstore');
  const isEdgeAddons =
    host === 'microsoftedge.microsoft.com' && url.pathname.toLowerCase().startsWith('/addons');
  if (BLOCKED_WEB_STORE_HOSTS.has(host) || isChromeWebStore || isEdgeAddons) {
    return unavailable('Not a job posting');
  }

  return { ok: true, code: null, message: '' };
}

export function injectionFailure(error) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : String(error || '');
  if (/no tab with id|frame with id .* removed|tab was closed|the tab was closed/i.test(message)) {
    return {
      ok: false,
      code: TAB_CHANGED,
      message: 'The tab changed while it was being captured. Try again.',
    };
  }
  if (
    /cannot access|cannot be scripted|extensions gallery|missing host permission|cannot access contents/i.test(
      message,
    )
  ) {
    return unavailable('Not a job posting');
  }
  return null;
}

function unavailable(message) {
  return { ok: false, code: UNSCRIPTABLE_TAB, message };
}
