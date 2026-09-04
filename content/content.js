(function () {
  'use strict';

  if (globalThis.__jobMaxxingContentLoaded) return;
  globalThis.__jobMaxxingContentLoaded = true;

  let lastUrl = location.href;

  const JOB_HOSTS = [
    'linkedin.com',
    'myworkdayjobs.com',
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
  ];

  function isJobPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const hasStructuredPosting = [...document.querySelectorAll('script[type="application/ld+json"]')].some((script) =>
      /["']JobPosting["']/i.test(script.textContent || ''),
    );
    if (hasStructuredPosting) return true;
    if (host.endsWith('linkedin.com')) return /^\/jobs\/view\//.test(path);
    if (host.endsWith('myworkdayjobs.com')) return /\/job(?:\/|$)/.test(path);
    if (!JOB_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return false;
    return Boolean(
      document.querySelector(
        '.job__description, .posting-headline, [class*="jobDescription"], [data-automation-id="jobPostingDescription"]',
      ),
    );
  }

  function notifyIfJobPage() {
    if (!chrome.runtime?.id || !isJobPage()) return;
    void chrome.runtime.sendMessage({ type: 'PAGE_DETECTED' }).catch(() => {});
  }

  const observer = new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    window.setTimeout(notifyIfJobPage, 700);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  notifyIfJobPage();
})();
