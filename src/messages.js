export const MSG = {
  SAVE_APPLICATION: 'SAVE_APPLICATION',
  UPDATE_APPLICATION: 'UPDATE_APPLICATION',
  DELETE_APPLICATION: 'DELETE_APPLICATION',
  GET_INDEX: 'GET_INDEX',
  GET_ALL: 'GET_ALL',
  GET_APPLICATION: 'GET_APPLICATION',
  SCRAPE_PAGE: 'SCRAPE_PAGE',
  SCRAPE_TAB: 'SCRAPE_TAB',
  PAGE_DETECTED: 'PAGE_DETECTED',
  REPAIR_INDEX: 'REPAIR_INDEX',
  EXPORT_JSON: 'EXPORT_JSON',
  IMPORT_JSON: 'IMPORT_JSON',
  WIPE_ALL: 'WIPE_ALL',
  SIGN_IN: 'SIGN_IN',
  SIGN_OUT: 'SIGN_OUT',
  GET_SESSION: 'GET_SESSION',
};

export function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error('Extension was reloaded — close and reopen this page.'));
      return;
    }

    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response ?? null);
    });
  });
}
