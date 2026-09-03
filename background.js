import { MSG } from './src/messages.js';
import {
  analyzeApplication,
} from './src/api/jobmaxxing.js';
import { getCurrentUser, signIn, signOut } from './src/auth/session.js';
import {
  deleteApplication,
  getAllApplications,
  getApplication,
  getIndex,
  repairIndex,
  saveApplication,
  updateApplication,
  wipeAll,
} from './src/storage.js';

const ALARM_PREFIX = 'followup:';

chrome.runtime.onInstalled.addListener(() => {
  // Ensures the service worker registers cleanly after install/reload.
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[jobmaxxing] message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

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
      await requireUser();
      const app = { ...msg.app };
      if (!app.id) app.id = crypto.randomUUID();
      if (!app.appliedAt && app.status !== 'saved') {
        app.appliedAt = new Date().toISOString().slice(0, 10);
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
      const saved = await updateApplication(updated);
      if (saved?.duplicate) return { ok: false, dupe: saved.duplicate };
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
      const scraped = injection?.result;
      if (!scraped) return { ok: true, scraped: null };
      return {
        ok: true,
        scraped: {
          title: scraped.title || '',
          company: scraped.company || '',
          location: scraped.location || '',
          description: scraped.description || '',
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
