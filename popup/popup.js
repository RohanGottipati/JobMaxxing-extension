import { MSG } from '../src/messages.js';
import { APP_URL } from '../config.local.js';
import { formatStatusLabel } from '../src/status-map.js';

const $ = (id) => document.getElementById(id);

const loginView = $('login-view');
const homeView = $('home-view');
const sessionLabel = $('session-label');
const loginError = $('login-error');
const formPanel = $('form-panel');
const formMsg = $('form-msg');
const recentList = $('recent-list');

let scrapedContext = null;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refreshSession() {
  const res = await send(MSG.GET_SESSION);
  if (res?.signedIn) {
    sessionLabel.textContent = res.email ?? 'Signed in';
    hide(loginView);
    show(homeView);
    await loadRecent();
    return;
  }
  sessionLabel.textContent = 'Sign in required';
  show(loginView);
  hide(homeView);
}

async function loadRecent() {
  recentList.innerHTML = '<li class="meta">Loading…</li>';
  try {
    const res = await send(MSG.GET_RECENT, { limit: 10 });
    const apps = res?.applications ?? [];
    if (!apps.length) {
      recentList.innerHTML = '<li class="meta">No applications yet.</li>';
      return;
    }
    recentList.innerHTML = apps.map((app) => `
      <li>
        <button type="button" data-id="${app.id}">
          <span class="title">${escapeHtml(app.roleTitle)} · ${escapeHtml(app.companyName)}</span>
          <span class="meta">${escapeHtml(formatStatusLabel(app.status))}</span>
        </button>
      </li>
    `).join('');
    recentList.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: `${APP_URL}/applications/${btn.dataset.id}` });
      });
    });
  } catch (error) {
    recentList.innerHTML = `<li class="meta error">${escapeHtml(error.message)}</li>`;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openForm(scraped = null) {
  scrapedContext = scraped;
  $('f-company').value = scraped?.company ?? '';
  $('f-title').value = scraped?.title ?? '';
  $('f-location').value = scraped?.location ?? '';
  $('f-desc').value = scraped?.description ?? '';
  $('f-notes').value = '';
  $('f-date').value = new Date().toISOString().slice(0, 10);
  $('f-status').value = 'saved';
  $('f-season').value = '';
  hide(formMsg);
  show(formPanel);
}

function closeForm() {
  hide(formPanel);
  scrapedContext = null;
}

function showFormMsg(text, kind) {
  formMsg.textContent = text;
  formMsg.className = `msg ${kind}`;
  show(formMsg);
}

async function saveForm() {
  const payload = {
    companyName: $('f-company').value.trim(),
    roleTitle: $('f-title').value.trim(),
    location: $('f-location').value.trim() || null,
    dateApplied: $('f-date').value || null,
    status: $('f-status').value,
    recruitingSeason: $('f-season').value || null,
    jobDescription: $('f-desc').value.trim() || null,
    notes: $('f-notes').value.trim() || null,
    sourceHost: scrapedContext?.sourceHost ?? null,
    jobUrl: scrapedContext?.jobUrl ?? null,
  };

  if (!payload.companyName || !payload.roleTitle) {
    showFormMsg('Company and role are required.', 'error');
    return;
  }

  try {
    const res = await send(MSG.SAVE_APPLICATION, { app: payload });
    if (res?.duplicate) {
      showFormMsg(`Duplicate: ${res.duplicate.roleTitle} at ${res.duplicate.companyName}`, 'warn');
      return;
    }
    if (res?.error) {
      showFormMsg(res.error, 'error');
      return;
    }
    if (res?.analyzed) {
      showFormMsg('Saved. Job analysis started in JobMaxxing.', 'ok');
    } else {
      showFormMsg('Saved to JobMaxxing.', 'ok');
    }
    await loadRecent();
    setTimeout(closeForm, 900);
  } catch (error) {
    showFormMsg(error.message ?? 'Save failed', 'error');
  }
}

$('sign-in').addEventListener('click', async () => {
  hide(loginError);
  try {
    const res = await send(MSG.SIGN_IN, {
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (res?.error) throw new Error(res.error);
    await refreshSession();
  } catch (error) {
    loginError.textContent = error.message ?? 'Sign in failed';
    show(loginError);
  }
});

$('sign-out').addEventListener('click', async () => {
  await send(MSG.SIGN_OUT);
  await refreshSession();
});

$('open-app').addEventListener('click', () => {
  chrome.tabs.create({ url: `${APP_URL}/applications` });
});

$('grab-page').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const res = await send(MSG.SCRAPE_TAB, { tabId: tab.id });
    if (!res?.scraped) {
      showFormMsg('Could not scrape this page.', 'error');
      openForm({});
      return;
    }
    openForm(res.scraped);
  } catch (error) {
    openForm({});
    showFormMsg(error.message ?? 'Scrape failed', 'error');
  }
});

$('add-manual').addEventListener('click', () => openForm({}));
$('cancel-form').addEventListener('click', closeForm);
$('save-form').addEventListener('click', saveForm);
$('refresh-recent').addEventListener('click', loadRecent);

refreshSession();
