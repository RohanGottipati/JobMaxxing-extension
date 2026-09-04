import { MSG } from './src/messages.js';
import {
  analyzeApplication,
} from './src/api/jobmaxxing.js';
import { getCurrentUser, getInstantSession, getSessionDisplay, signIn, signOut } from './src/auth/session.js';
import {
  installWebSessionSync,
  pushSessionToWeb,
  pushSignOutToWeb,
  syncFromWeb,
} from './src/auth/web-sync.js';
import { isNetworkUnavailableError } from './src/network.js';
import { detectJobPostingPage, scrapePage } from './src/scrape/page.js';
import {
  clearIndexCache,
  deleteApplication,
  getAllApplications,
  getApplication,
  getIndex,
  repairIndex,
  saveApplication,
  updateApplication,
  wipeAll,
} from './src/storage.js';
import { todayLocalDate } from './src/util/date.js';
import {
  captureEligibility,
  injectionFailure,
  NOT_JOB_POSTING,
} from './src/util/tab-url.js';

const ALARM_PREFIX = 'followup:';

chrome.runtime.onInstalled.addListener(() => {
  // Ensures the service worker registers cleanly after install/reload.
});

// Mirror the website's login state into the extension: adopt its session when
// signed in, clear ours when it signs out.
installWebSessionSync();

// Open the extension UI in the side panel when the toolbar icon is clicked, so it
// stays open while you click around pages and tabs (a normal popup would close).
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  .catch((error) => console.warn('[jobmaxxing] side panel unavailable:', error));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then((result) => respond(sendResponse, result))
    .catch((err) => {
      const expectedInjectionFailure = injectionFailure(err);
      if (expectedInjectionFailure) {
        respond(sendResponse, {
          ...expectedInjectionFailure,
          error: expectedInjectionFailure.message,
        });
        return;
      }
      if (isNetworkUnavailableError(err)) {
        console.warn('[jobmaxxing] connection unavailable:', err.message);
      } else {
        console.error('[jobmaxxing] message error:', err);
      }
      respond(sendResponse, { error: err instanceof Error ? err.message : String(err) });
    });
  return true;
});

// sendResponse throws "Attempting to use a disconnected port object" when the
// sender (usually the popup) closed while an async handler was still running.
// That secondary throw escaped the .catch above and surfaced as an extension
// error, so deliver best-effort instead.
function respond(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch {
    // Port already disconnected; there is no one left to notify.
  }
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication is required.');
  return user;
}

async function maybeAnalyze(savedApp, sourceText) {
  if (!savedApp?.id || !sourceText) return { analyzed: false, analyzeError: null };
  try {
    const result = await analyzeApplication(savedApp.id, sourceText);
    if (result?.ok !== false) return { analyzed: true, analyzeError: null };
    return { analyzed: false, analyzeError: 'Analysis unavailable' };
  } catch (error) {
    return {
      analyzed: false,
      analyzeError: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

async function inspectJobPostingTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: detectJobPostingPage,
  });
  return injection?.result || { isJobPosting: false, signal: null };
}

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case MSG.SIGN_IN: {
      const session = await signIn(msg.email, msg.password);
      // Mirror into the website's cookies so signing in here logs the site in too.
      await pushSessionToWeb(session);
      const display = await getSessionDisplay();
      return {
        ok: true,
        email: display?.email ?? session.user?.email,
        fullName: display?.fullName ?? null,
        displayName: display?.displayName ?? null,
      };
    }

    case MSG.SIGN_OUT: {
      await signOut();
      // Mirror the sign-out to the website so it logs out too.
      await pushSignOutToWeb();
      await clearIndexCache();
      return { ok: true };
    }

    case MSG.GET_SESSION: {
      // Reflect the website's current login state before reporting ours.
      await syncFromWeb();
      const instant = await getInstantSession();
      if (instant.signedIn && instant.cached) {
        // Cached identity is enough to render immediately. A background
        // refresh is best-effort and must not become an unhandled rejection.
        void getSessionDisplay().catch(() => {});
        return {
          ok: true,
          signedIn: true,
          email: instant.email ?? null,
          fullName: instant.fullName ?? null,
          displayName: instant.displayName ?? null,
        };
      }

      const session = await getSessionDisplay();
      return {
        ok: true,
        signedIn: Boolean(session),
        email: session?.email ?? null,
        fullName: session?.fullName ?? null,
        displayName: session?.displayName ?? null,
      };
    }

    case MSG.SAVE_APPLICATION: {
      await requireUser();
      const app = { ...msg.app };
      delete app.id;
      if (!app.appliedAt && app.status !== 'saved') {
        app.appliedAt = todayLocalDate();
      }

      try {
        const saved = await saveApplication(app);
        if (saved?.duplicate) {
          return { ok: true, app, dupe: saved.duplicate };
        }

        const prefs = await getPrefs();
        if (prefs.followupEnabled && saved?.status === 'applied') {
          scheduleFollowup(saved.id, prefs.followupDays);
        }

        const analyze = await maybeAnalyze(saved, app.description);
        return { ok: true, app: saved, dupe: null, ...analyze };
      } catch (error) {
        if (error.status === 409 && error.payload?.duplicate) {
          return { ok: true, app, dupe: error.payload.duplicate };
        }
        throw error;
      }
    }

    case MSG.UPDATE_APPLICATION: {
      await requireUser();
      const existing = await getApplication(msg.app.id);
      if (!existing) return { ok: false, error: 'Not found' };
      const updated = { ...existing, ...msg.app };
      if (updated.status && updated.status !== 'saved' && !updated.appliedAt) {
        updated.appliedAt = todayLocalDate();
      }
      let saved;
      try {
        saved = await updateApplication(updated);
        if (saved?.duplicate) return { ok: true, app: updated, dupe: saved.duplicate };
      } catch (error) {
        if (error.status === 409 && error.payload?.duplicate) {
          return { ok: true, app: updated, dupe: error.payload.duplicate };
        }
        throw error;
      }
      if (saved?.status === 'applied') {
        const prefs = await getPrefs();
        if (prefs.followupEnabled) scheduleFollowup(saved.id, prefs.followupDays);
      } else {
        clearAlarm(saved.id);
      }
      return { ok: true, app: saved };
    }

    case MSG.DELETE_APPLICATION: {
      await requireUser();
      await deleteApplication(msg.id);
      clearAlarm(msg.id);
      return { ok: true };
    }

    case MSG.GET_INDEX: {
      await requireUser();
      return { ok: true, index: await getIndex() };
    }

    case MSG.GET_APPLICATION: {
      await requireUser();
      return { ok: true, app: await getApplication(msg.id) };
    }

    case MSG.GET_ALL: {
      await requireUser();
      return { ok: true, apps: await getAllApplications() };
    }

    case MSG.REPAIR_INDEX: {
      await requireUser();
      return { ok: true, index: await repairIndex() };
    }

    case MSG.EXPORT_JSON: {
      await requireUser();
      const apps = await getAllApplications();
      return { ok: true, data: JSON.stringify(apps, null, 2) };
    }

    case MSG.IMPORT_JSON: {
      await requireUser();
      const apps = JSON.parse(msg.data);
      for (const app of apps) {
        if (!app.id) app.id = crypto.randomUUID();
        await saveApplication(app);
      }
      return { ok: true, count: apps.length };
    }

    case MSG.WIPE_ALL: {
      await requireUser();
      await wipeAll();
      const alarms = await chrome.alarms.getAll();
      await Promise.all(
        alarms
          .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
          .map((alarm) => chrome.alarms.clear(alarm.name)),
      );
      return { ok: true };
    }

    case MSG.CHECK_JOB_PAGE:
    case MSG.SCRAPE_TAB: {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (!tabId) return { ok: false, error: 'No active tab' };
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const eligibility = captureEligibility(tab?.url);
      if (!eligibility.ok) {
        return { ok: false, code: eligibility.code, error: eligibility.message };
      }

      let inspection;
      try {
        inspection = await inspectJobPostingTab(tabId);
      } catch (error) {
        const expected = injectionFailure(error);
        if (expected) {
          return { ok: false, code: expected.code, error: expected.message };
        }
        throw error;
      }
      if (!inspection.isJobPosting) {
        return {
          ok: msg.type === MSG.CHECK_JOB_PAGE,
          isJobPosting: false,
          code: NOT_JOB_POSTING,
          error: msg.type === MSG.SCRAPE_TAB
            ? 'Open an individual job posting before using Grab.'
            : null,
        };
      }
      if (msg.type === MSG.CHECK_JOB_PAGE) {
        return { ok: true, isJobPosting: true, signal: inspection.signal };
      }

      let injection;
      try {
        [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapePage,
        });
      } catch (error) {
        const expected = injectionFailure(error);
        if (expected) {
          return { ok: false, code: expected.code, error: expected.message };
        }
        throw error;
      }
      const scraped = injection?.result;
      if (!scraped) return { ok: false, error: 'No job details were found on this page.' };
      return {
        ok: true,
        scraped: {
          title: scraped.title || '',
          company: scraped.company || '',
          location: scraped.location || '',
          description: scraped.description || '',
          deadline: scraped.deadline || '',
          recruitingSeason: scraped.recruitingSeason || '',
          sourceHost: scraped.sourceHost || '',
          jobUrl: scraped.jobUrl || '',
        },
      };
    }

    case MSG.PAGE_DETECTED: {
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.action.setBadgeText({ text: 'NEW', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#2f4f45', tabId });
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

async function getPrefs() {
  const res = await chrome.storage.local.get('prefs');
  const prefs = res.prefs || {};
  return {
    followupEnabled: prefs.followupEnabled ?? false,
    followupDays: prefs.followupDays ?? 10,
  };
}

function scheduleFollowup(appId, days) {
  chrome.alarms.create(`${ALARM_PREFIX}${appId}`, {
    delayInMinutes: days * 24 * 60,
  });
}

function clearAlarm(appId) {
  chrome.alarms.clear(`${ALARM_PREFIX}${appId}`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  try {
    const app = await getApplication(id);
    if (!app || app.status !== 'applied') return;
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
    chrome.action.setTitle({
      title: `Follow up on: ${app.title} at ${app.company}`,
    });
  } catch {
    // Session may have expired.
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.prefs) return;
  const prefs = changes.prefs.newValue || {};
  if (!prefs.followupEnabled) {
    const alarms = await chrome.alarms.getAll();
    await Promise.all(
      alarms
        .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
        .map((alarm) => chrome.alarms.clear(alarm.name)),
    );
  }
});
