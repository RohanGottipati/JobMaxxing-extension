(function () {
  'use strict';

  if (globalThis.__jobMaxxingContentLoaded) return;
  globalThis.__jobMaxxingContentLoaded = true;

  let lastUrl = location.href;

  function notifyIfJobPage() {
    if (!chrome.runtime?.id || !globalThis.__jobMaxxingIsJobPage?.()) return;
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
