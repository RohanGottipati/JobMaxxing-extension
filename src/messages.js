export const MSG = {
  SAVE_APPLICATION: 'SAVE_APPLICATION',
  GET_RECENT: 'GET_RECENT',
  SCRAPE_TAB: 'SCRAPE_TAB',
  PAGE_DETECTED: 'PAGE_DETECTED',
  GET_SESSION: 'GET_SESSION',
  SIGN_IN: 'SIGN_IN',
  SIGN_OUT: 'SIGN_OUT',
};

export function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}
