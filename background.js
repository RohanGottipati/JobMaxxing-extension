import { MSG } from './src/messages.js';
import {
  analyzeApplication,
  getRecentApplications,
  saveApplication,
} from './src/api/jobmaxxing.js';
import { getCurrentUser, signIn, signOut } from './src/auth/session.js';
import { toApiStatus } from './src/status-map.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[jobmaxxing] message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case MSG.SIGN_IN: {
      const session = await signIn(msg.email, msg.password);
      return { ok: true, email: session.user?.email };
    }

    case MSG.SIGN_OUT: {
      await signOut();
      return { ok: true };
    }

    case MSG.GET_SESSION: {
      const user = await getCurrentUser();
      return { ok: true, signedIn: Boolean(user), email: user?.email ?? null };
    }

    case MSG.SAVE_APPLICATION: {
      const app = msg.app;
      const notes = app.status === 'ghosted' && app.notes
        ? `[ghosted] ${app.notes}`
        : app.notes;

      try {
        const result = await saveApplication({
          companyName: app.companyName,
          roleTitle: app.roleTitle,
          jobUrl: app.jobUrl ?? null,
          location: app.location ?? null,
          dateApplied: app.dateApplied ?? null,
          status: toApiStatus(app.status ?? 'saved'),
          jobDescription: app.jobDescription ?? null,
          notes: notes ?? null,
          sourceHost: app.sourceHost ?? null,
          recruitingSeason: app.recruitingSeason ?? null,
        });

        let analyzed = false;
        let analyzeError = null;
        if (result.aiConsent && result.application?.id && app.jobDescription) {
          try {
            await analyzeApplication(result.application.id, app.jobDescription);
            analyzed = true;
          } catch (error) {
            analyzeError = error instanceof Error ? error.message : 'Analysis failed';
          }
        }

        return {
          ok: true,
          application: result.application,
          analyzed,
          analyzeError,
        };
      } catch (error) {
        if (error.status === 409 && error.payload?.duplicate) {
          return { ok: false, duplicate: error.payload.duplicate };
        }
        throw error;
      }
    }

    case MSG.GET_RECENT: {
      const data = await getRecentApplications(msg.limit ?? 10);
      return { ok: true, applications: data.applications };
    }

    case MSG.SCRAPE_TAB: {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (!tabId) return { ok: false, error: 'No active tab' };
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/scrape/inject.js'],
      });
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => globalThis.__jobMaxxingScrapePage?.() ?? null,
      });
      return { ok: true, scraped: injection?.result ?? null };
    }

    case MSG.PAGE_DETECTED: {
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.action.setBadgeText({ text: 'NEW', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8', tabId });
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
