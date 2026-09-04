import { bindAuthForm } from '../src/auth-gate.js';
import { getInstantSession, getSessionDisplay } from '../src/auth/session.js';
import { MSG, send } from '../src/messages.js';
import { openApplication, openJobMaxxing } from '../src/api/jobmaxxing.js';
import {
  removeApplicationDocuments,
  uploadApplicationDocument,
} from '../src/api/documents.js';
import { validateDocumentFile } from '../src/document-policy.js';
import { fromApiStatus } from '../src/mapping.js';
import { getCachedIndex } from '../src/storage.js';
import { STATUS_LABEL } from '../src/status-map.js';
import { todayLocalDate } from '../src/util/date.js';
import { defaultMergedPdfName } from '../src/util/pdf-name.js';
import { findByJobUrl } from '../src/util/job-url.js';
import { captureEligibility } from '../src/util/tab-url.js';

const SEASONS = ['Summer 2027', 'Winter 2027'];
let editingId = null;
let scrapedJobUrl = null;
let scrapedSourceHost = null;
let indexCache = [];
let pageMatch = null;
let justSaved = null;
let lastAction = null;
let grabEligibility = { ok: false, code: null, message: '' };
let grabError = null;
let grabHintRequest = 0;
let grabHintResolved = false;
let appliedDateIsAutomatic = false;
let resumeFile = null;
let coverLetterFile = null;

const GRAB_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5A1.5 1.5 0 015.5 2h5.086a1.5 1.5 0 011.06.44l3.914 3.914A1.5 1.5 0 0116 7.414V16.5A1.5 1.5 0 0114.5 18h-9A1.5 1.5 0 014 16.5v-13zM10.5 3H5.5a.5.5 0 00-.5.5v13a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V8h-3.5A1.5 1.5 0 0110.5 6.5V3zm1 0v3.5a.5.5 0 00.5.5H15.5L11.5 3zM7 11.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 017 11.25zm.75 2.5a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z"/></svg>`;

const home = document.getElementById('home');
const appCount = document.getElementById('app-count');
const formView = document.getElementById('form-view');
const formTitle = document.getElementById('form-title');
const btnGrab = document.getElementById('btn-grab');
const grabIcon = document.getElementById('grab-icon');
const grabTitle = document.getElementById('grab-title');
const grabSub = document.getElementById('grab-sub');
const fId = document.getElementById('f-id');
const fTitle = document.getElementById('f-title');
const fCompany = document.getElementById('f-company');
const fLocation = document.getElementById('f-location');
const fDate = document.getElementById('f-date');
const fStatus = document.getElementById('f-status');
const fSeason = document.getElementById('f-season');
const fDeadline = document.getElementById('f-deadline');
const fNext = document.getElementById('f-next');
const fUrl = document.getElementById('f-url');
const fDesc = document.getElementById('f-desc');
const fNotes = document.getElementById('f-notes');
const fReferral = document.getElementById('f-referral');
const fResume = document.getElementById('f-resume');
const fCoverLetter = document.getElementById('f-cover-letter');
const fResumeMeta = document.getElementById('f-resume-meta');
const fCoverLetterMeta = document.getElementById('f-cover-letter-meta');
const btnRemoveResume = document.getElementById('btn-remove-resume');
const btnRemoveCoverLetter = document.getElementById('btn-remove-cover-letter');
const fDupe = document.getElementById('f-dupe');
const formStateLabel = document.getElementById('form-state-label');
const btnDelete = document.getElementById('btn-delete');
const btnSave = document.getElementById('btn-save');
const mergeView = document.getElementById('merge-view');
const pageMatchEl = document.getElementById('page-match');
const pageMatchKicker = document.getElementById('page-match-kicker');
const pageMatchTitle = document.getElementById('page-match-title');
const pageMatchMeta = document.getElementById('page-match-meta');
const btnOpenMatch = document.getElementById('btn-open-match');
const btnApplyMatch = document.getElementById('btn-apply-match');
const recentEl = document.getElementById('recent');
const recentList = document.getElementById('recent-list');

SEASONS.forEach((s) => fSeason.appendChild(new Option(s, s)));

function dateInputValue(value) {
  return String(value || '').slice(0, 10);
}

function statusLabel(status) {
  return STATUS_LABEL[status] || status || 'Saved';
}

function asNoticeApp(value) {
  if (!value) return null;
  if (value.title || value.company) {
    return {
      id: value.id,
      title: value.title || '',
      company: value.company || '',
      status: value.status || 'saved',
    };
  }
  return {
    id: value.id,
    title: value.roleTitle || '',
    company: value.companyName || '',
    status: fromApiStatus(value.status),
  };
}

function featuredApp() {
  return justSaved || pageMatch;
}

function applyIndex(index) {
  indexCache = Array.isArray(index) ? index : [];
  appCount.textContent = indexCache.length || '';
}

async function loadIndex() {
  try {
    const res = await send(MSG.GET_INDEX);
    // Background failures come back as { error } rather than a rejected send.
    // Treating one as a successful empty response wiped the hydrated view.
    if (!res?.ok || res.error) throw new Error(res?.error || 'Index unavailable');
    applyIndex(res.index || []);
  } catch {
    // Keep the cached index on transient failures; only an empty cache
    // legitimately renders the empty state.
    if (!indexCache.length) applyIndex([]);
  }
}

async function hydrateHome() {
  const cached = await getCachedIndex();
  if (cached) {
    applyIndex(cached);
    await detectPageMatch();
    renderNotice();
    renderRecent();
  }
  await updateGrabHint();
}

async function detectPageMatch() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageMatch = asNoticeApp(findByJobUrl(indexCache, tab?.url));
  } catch {
    pageMatch = null;
  }
}

function renderNotice() {
  const app = featuredApp();
  if (!app?.id) {
    pageMatchEl.hidden = true;
    return;
  }

  pageMatchKicker.textContent =
    lastAction === 'saved'
      ? 'Saved'
      : lastAction === 'updated'
        ? 'Updated'
        : 'Already tracking';
  pageMatchTitle.textContent = app.title || 'Untitled role';
  pageMatchMeta.textContent = [app.company, statusLabel(app.status)].filter(Boolean).join(' · ');
  btnApplyMatch.hidden = app.status !== 'saved';
  pageMatchEl.hidden = false;
}

function renderRecent() {
  const featuredId = featuredApp()?.id;
  const items = indexCache.filter((app) => app.id !== featuredId).slice(0, 3);
  recentList.replaceChildren();
  if (!items.length) {
    recentEl.hidden = true;
    return;
  }

  for (const app of items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-item';
    button.innerHTML = `
      <span class="recent-item-title">${esc(app.title || 'Untitled role')}</span>
      <span class="recent-item-meta">${esc([app.company, statusLabel(app.status)].filter(Boolean).join(' · '))}</span>`;
    button.addEventListener('click', () => openApplication(app.id));
    li.appendChild(button);
    recentList.appendChild(li);
  }
  recentEl.hidden = false;
}

async function refreshHome() {
  await loadIndex();
  await detectPageMatch();
  renderNotice();
  renderRecent();
  if (grabHintResolved) syncResolvedGrabHint();
  else await updateGrabHint();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && formView.style.display !== 'none') {
    closeForm();
    void refreshHome();
  }
  if (e.key === 'Escape' && mergeView.style.display !== 'none') closeMergeView();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && formView.style.display !== 'none') saveForm();
});

function replayEnter(el) {
  el.classList.remove('panel-enter');
  void el.offsetWidth;
  el.classList.add('panel-enter');
}

function setGrabBusy(busy) {
  btnGrab.disabled = busy || !grabEligibility.ok;
  btnGrab.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) grabTitle.textContent = 'Capturing…';
  grabIcon.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span>' : GRAB_ICON;
}

function syncResolvedGrabHint() {
  if (!grabHintResolved || !grabEligibility.ok || btnGrab.getAttribute('aria-busy') === 'true') {
    return;
  }
  if (pageMatch) {
    grabTitle.textContent = 'Update this posting';
    grabSub.textContent = [pageMatch.company, statusLabel(pageMatch.status)].filter(Boolean).join(' · ');
    return;
  }
  grabTitle.textContent = grabError ? 'Capture unavailable' : 'Grab this posting';
  grabSub.textContent = grabError || 'Capture the role and job description';
}

async function updateGrabHint() {
  if (btnGrab.getAttribute('aria-busy') === 'true') return;
  const request = ++grabHintRequest;
  grabEligibility = { ok: false, code: null, message: '' };
  btnGrab.disabled = true;
  if (!grabHintResolved) {
    btnGrab.title = 'Checking whether this tab is a job posting';
    grabTitle.textContent = 'Checking this page…';
    grabSub.textContent = 'Grab works only on individual job postings';
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (request !== grabHintRequest) return;
    grabEligibility = captureEligibility(tab?.url);
    if (!grabEligibility.ok) {
      grabTitle.textContent = 'Not a job posting';
      grabSub.textContent = '';
      btnGrab.title = 'Not a job posting';
      btnGrab.disabled = true;
      grabHintResolved = true;
      return;
    }

    const result = await send(MSG.CHECK_JOB_PAGE, { tabId: tab.id });
    if (request !== grabHintRequest) return;
    if (!result?.ok || result.error) {
      throw new Error(result?.error || 'Could not inspect this page.');
    }
    if (!result.isJobPosting) {
      const message = 'Not a job posting';
      grabEligibility = { ok: false, code: result.code, message };
      grabTitle.textContent = 'Not a job posting';
      grabSub.textContent = '';
      btnGrab.title = message;
      btnGrab.disabled = true;
      grabHintResolved = true;
      return;
    }

    grabEligibility = { ok: true, code: null, message: '' };
    grabHintResolved = true;
    btnGrab.disabled = false;
    btnGrab.title = 'Capture the job posting on the current tab';
    syncResolvedGrabHint();
  } catch (error) {
    if (request !== grabHintRequest) return;
    const message = error instanceof Error ? error.message : 'Could not inspect this page.';
    grabEligibility = { ok: false, message };
    grabHintResolved = true;
    btnGrab.disabled = true;
    btnGrab.title = message;
    grabTitle.textContent = message === 'Not a job posting' ? message : 'Can’t check this page';
    grabSub.textContent = message === 'Not a job posting' ? '' : message;
  }
}

document.getElementById('btn-add').addEventListener('click', () => openAddForm());
document.getElementById('btn-open-web').addEventListener('click', () => openJobMaxxing('/applications'));
btnOpenMatch.addEventListener('click', () => {
  const app = featuredApp();
  if (app?.id) void openApplication(app.id);
});
btnApplyMatch.addEventListener('click', async () => {
  const app = featuredApp();
  if (!app?.id || app.status !== 'saved') return;
  btnApplyMatch.disabled = true;
  btnApplyMatch.textContent = 'Updating…';
  try {
    const res = await send(MSG.UPDATE_APPLICATION, { app: { id: app.id, status: 'applied' } });
    if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Could not update status');
    justSaved = asNoticeApp(res.app) || { ...app, status: 'applied' };
    lastAction = 'updated';
    await refreshHome();
  } catch (err) {
    pageMatchMeta.textContent = err instanceof Error ? err.message : 'Could not mark applied';
  } finally {
    btnApplyMatch.disabled = false;
    btnApplyMatch.textContent = 'Mark applied';
  }
});

btnGrab.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  grabEligibility = captureEligibility(tab.url);
  if (!grabEligibility.ok) {
    grabError = null;
    await updateGrabHint();
    return;
  }
  grabError = null;
  setGrabBusy(true);
  try {
    const res = await send(MSG.SCRAPE_TAB, { tabId: tab.id });
    if (!res?.ok || res.error) throw new Error(res?.error || 'Could not capture this page.');
    const scraped = res?.scraped || {};
    let existing = pageMatch;
    if (pageMatch?.id) {
      try {
        const full = await send(MSG.GET_APPLICATION, { id: pageMatch.id });
        if (full?.app) existing = full.app;
      } catch {
        existing = pageMatch;
      }
    }
    const promoteToApplied = !existing?.id || (existing.status === 'saved' && !existing.appliedAt);
    openAddForm({
      ...(existing || {}),
      title: scraped.title || existing?.title,
      company: scraped.company || existing?.company,
      location: scraped.location || existing?.location,
      appliedAt: promoteToApplied ? todayLocalDate() : existing?.appliedAt,
      status: promoteToApplied ? 'applied' : existing?.status,
      deadline: scraped.deadline || existing?.deadline,
      season: scraped.recruitingSeason || existing?.season,
      description: scraped.description || existing?.description,
      sourceHost: scraped.sourceHost || existing?.sourceHost,
      jobUrl: scraped.jobUrl || existing?.jobUrl,
    });
  } catch (error) {
    grabError = error instanceof Error ? error.message : 'Could not capture this page.';
  } finally {
    setGrabBusy(false);
    await updateGrabHint();
  }
});

function openAddForm(prefill = {}) {
  editingId = prefill.id || null;
  scrapedJobUrl = prefill.jobUrl || null;
  scrapedSourceHost = prefill.sourceHost || null;
  formTitle.textContent = editingId ? 'Edit role' : 'New role';
  formStateLabel.textContent = editingId ? 'Saved' : 'Draft';
  fId.value = prefill.id || '';
  fTitle.value = prefill.title || '';
  fCompany.value = prefill.company || '';
  fLocation.value = prefill.location || '';
  const newEntry = !editingId;
  fDate.value = dateInputValue(prefill.appliedAt) || (newEntry ? todayLocalDate() : '');
  fStatus.value = prefill.status || (newEntry ? 'applied' : 'saved');
  appliedDateIsAutomatic = newEntry && !prefill.appliedAt;
  ensureSeasonOption(prefill.season);
  fSeason.value = prefill.season || '';
  fDeadline.value = dateInputValue(prefill.deadline);
  fNext.value = prefill.nextAction || '';
  fUrl.value = prefill.jobUrl || '';
  fDesc.value = prefill.description || '';
  fNotes.value = prefill.notes || '';
  fReferral.value = prefill.referralContact || '';
  resumeFile = null;
  coverLetterFile = null;
  fResume.value = '';
  fCoverLetter.value = '';
  renderPackageFileState('resume', Boolean(prefill.submittedResumeVersionId));
  renderPackageFileState('coverLetter', Boolean(prefill.submittedCoverLetterId));
  fDupe.style.display = 'none';
  btnDelete.style.display = editingId ? '' : 'none';
  btnSave.disabled = false;
  btnSave.textContent = editingId ? 'Save changes' : 'Save role';
  home.style.display = 'none';
  formView.style.display = 'flex';
  replayEnter(formView);
}

function closeForm() {
  formView.style.display = 'none';
  home.style.display = 'flex';
  replayEnter(home);
  editingId = null;
  scrapedJobUrl = null;
  scrapedSourceHost = null;
  resumeFile = null;
  coverLetterFile = null;
}

function ensureSeasonOption(value) {
  if (!value || [...fSeason.options].some((option) => option.value === value)) return;
  fSeason.appendChild(new Option(value, value));
}

function renderPackageFileState(kind, hasExisting = false) {
  const file = kind === 'resume' ? resumeFile : coverLetterFile;
  const meta = kind === 'resume' ? fResumeMeta : fCoverLetterMeta;
  const remove = kind === 'resume' ? btnRemoveResume : btnRemoveCoverLetter;
  if (file) {
    meta.textContent = `${file.name} · ${humanSize(file.size)}`;
    remove.hidden = false;
  } else {
    meta.textContent = hasExisting ? 'Submitted file already on record' : 'No file selected';
    remove.hidden = true;
  }
}

function selectPackageFile(kind, input) {
  const file = input.files?.[0] ?? null;
  if (file) {
    const error = validateDocumentFile(file);
    if (error) {
      input.value = '';
      showFormError(`${file.name}: ${error}`);
      return;
    }
  }
  fDupe.style.display = 'none';
  if (kind === 'resume') resumeFile = file;
  else coverLetterFile = file;
  renderPackageFileState(kind);
}

fResume.addEventListener('change', () => selectPackageFile('resume', fResume));
fCoverLetter.addEventListener('change', () => selectPackageFile('coverLetter', fCoverLetter));
btnRemoveResume.addEventListener('click', () => {
  resumeFile = null;
  fResume.value = '';
  renderPackageFileState('resume');
});
btnRemoveCoverLetter.addEventListener('click', () => {
  coverLetterFile = null;
  fCoverLetter.value = '';
  renderPackageFileState('coverLetter');
});
fDate.addEventListener('input', () => {
  appliedDateIsAutomatic = false;
});
fStatus.addEventListener('change', () => {
  if (fStatus.value === 'saved' && appliedDateIsAutomatic) {
    fDate.value = '';
    return;
  }
  if (fStatus.value !== 'saved' && !fDate.value) {
    fDate.value = todayLocalDate();
    appliedDateIsAutomatic = true;
  }
});

async function saveForm() {
  const title = fTitle.value.trim();
  const company = fCompany.value.trim();
  if (!title || !company) {
    const missing = title ? fCompany : fTitle;
    missing.reportValidity?.();
    missing.focus();
    return;
  }

  // Snapshot the form before uploads begin. Closing or editing the popup while
  // a large file is uploading must not turn an update into a new application
  // or mix values from two different form states.
  const applicationId = editingId;
  const selectedResume = resumeFile;
  const selectedCoverLetter = coverLetterFile;
  const app = {
    id: applicationId || undefined,
    title,
    company,
    location: fLocation.value.trim(),
    appliedAt: fDate.value || null,
    deadline: fDeadline.value || null,
    nextAction: fNext.value.trim(),
    status: fStatus.value,
    season: fSeason.value || null,
    description: fDesc.value.trim(),
    notes: fNotes.value.trim(),
    referralContact: fReferral.value.trim(),
    jobUrl: fUrl.value.trim() || scrapedJobUrl,
    sourceHost: scrapedSourceHost,
  };

  btnSave.disabled = true;
  btnSave.textContent = selectedResume || selectedCoverLetter ? 'Uploading…' : 'Saving…';

  const uploadedPaths = [];
  let submittedFiles;
  try {
    const files = {};
    if (selectedResume) {
      files.resume = await uploadApplicationDocument(selectedResume);
      uploadedPaths.push(files.resume.path);
    }
    if (selectedCoverLetter) {
      files.coverLetter = await uploadApplicationDocument(selectedCoverLetter);
      uploadedPaths.push(files.coverLetter.path);
    }
    if (Object.keys(files).length) submittedFiles = files;
    btnSave.textContent = 'Saving…';
  } catch (error) {
    await removeApplicationDocuments(uploadedPaths);
    showFormError(`Upload failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    btnSave.disabled = false;
    btnSave.textContent = applicationId ? 'Save changes' : 'Save role';
    return;
  }

  if (submittedFiles) app.submittedFiles = submittedFiles;

  const msgType = applicationId ? MSG.UPDATE_APPLICATION : MSG.SAVE_APPLICATION;
  let res;
  try {
    res = await send(msgType, { app });
  } catch (err) {
    await removeApplicationDocuments(uploadedPaths);
    showFormError(`Save failed: ${err.message}`);
    btnSave.disabled = false;
    btnSave.textContent = applicationId ? 'Save changes' : 'Save role';
    return;
  }

  if (!res || res.error || res.ok === false) {
    await removeApplicationDocuments(uploadedPaths);
    showFormError(`Save failed: ${res?.error || 'unknown error'}`);
    btnSave.disabled = false;
    btnSave.textContent = applicationId ? 'Save changes' : 'Save role';
    return;
  }

  if (res.dupe) {
    await removeApplicationDocuments(uploadedPaths);
    justSaved = asNoticeApp(res.dupe);
    lastAction = 'duplicate';
    closeForm();
    await refreshHome();
    return;
  }

  justSaved = asNoticeApp(res.app);
  lastAction = justSaved?.status === 'saved' ? 'saved' : 'updated';
  closeForm();
  await refreshHome();
}

document.getElementById('btn-back').addEventListener('click', async () => {
  closeForm();
  await refreshHome();
});
btnSave.addEventListener('click', saveForm);
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this application?')) return;
  await send(MSG.DELETE_APPLICATION, { id: editingId });
  if (justSaved?.id === editingId) {
    justSaved = null;
    lastAction = null;
  }
  closeForm();
  await refreshHome();
});

function showFormError(msg) {
  fDupe.textContent = msg;
  fDupe.style.display = 'block';
  console.error('[jobmaxxing]', msg);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const mergeInput = document.getElementById('merge-input');
const mergeDrop = document.getElementById('merge-drop');
const mergeListEl = document.getElementById('merge-list');
const mergeName = document.getElementById('merge-name');
const mergeStatus = document.getElementById('merge-status');
const btnMergeGo = document.getElementById('btn-merge-go');
const btnMergeClear = document.getElementById('btn-merge-clear');
let mergeFiles = [];
let mergeDefaultName = defaultMergedPdfName();

function openMergeView() {
  mergeFiles = [];
  renderMergeList();
  setMergeStatus('');
  mergeDefaultName = defaultMergedPdfName();
  mergeName.value = mergeDefaultName;
  home.style.display = 'none';
  mergeView.style.display = 'flex';
  replayEnter(mergeView);

  let suggestedName = mergeName.value;
  void (async () => {
    const applySuggestedName = (session) => {
      const preferredName = defaultMergedPdfName({
        fullName: session?.fullName,
        email: session?.email,
      });
      mergeDefaultName = preferredName;
      if (mergeName.value === suggestedName) {
        mergeName.value = preferredName;
        suggestedName = preferredName;
      }
    };

    applySuggestedName(await getInstantSession());
    applySuggestedName(await getSessionDisplay());
  })()
    .catch(() => {});
}
function closeMergeView() {
  mergeView.style.display = 'none';
  home.style.display = 'flex';
  replayEnter(home);
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function addMergeFiles(fileList) {
  const pdfs = [...fileList].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  const skipped = fileList.length - pdfs.length;
  mergeFiles.push(...pdfs);
  renderMergeList();
  if (skipped > 0) setMergeStatus(`Skipped ${skipped} non-PDF file${skipped > 1 ? 's' : ''}.`, 'info');
  else setMergeStatus('');
}

function renderMergeList() {
  mergeListEl.innerHTML = '';
  mergeFiles.forEach((file, i) => {
    const li = document.createElement('li');
    li.className = 'merge-item';
    li.innerHTML = `
      <span class="merge-item-idx">${i + 1}</span>
      <span class="merge-item-name" title="${esc(file.name)}">${esc(file.name)}</span>
      <span class="merge-item-size">${humanSize(file.size)}</span>
      <span class="merge-item-btns">
        <button class="up" title="Move up" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 20 20"><path d="M10 5l5 6H5l5-6z"/></svg></button>
        <button class="down" title="Move down" ${i === mergeFiles.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 20 20"><path d="M10 15l-5-6h10l-5 6z"/></svg></button>
        <button class="rm" title="Remove"><svg viewBox="0 0 20 20"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button>
      </span>`;
    li.querySelector('.up').addEventListener('click', () => moveMerge(i, -1));
    li.querySelector('.down').addEventListener('click', () => moveMerge(i, 1));
    li.querySelector('.rm').addEventListener('click', () => { mergeFiles.splice(i, 1); renderMergeList(); });
    mergeListEl.appendChild(li);
  });
  btnMergeGo.disabled = mergeFiles.length < 1;
  btnMergeClear.style.display = mergeFiles.length ? 'inline-flex' : 'none';
}

function moveMerge(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= mergeFiles.length) return;
  [mergeFiles[i], mergeFiles[j]] = [mergeFiles[j], mergeFiles[i]];
  renderMergeList();
}

function setMergeStatus(msg, kind = 'info') {
  if (!msg) { mergeStatus.style.display = 'none'; return; }
  mergeStatus.textContent = msg;
  mergeStatus.className = `merge-status ${kind}`;
  mergeStatus.style.display = 'block';
}

async function combineAndDownload() {
  if (mergeFiles.length < 1 || typeof PDFLib === 'undefined') {
    setMergeStatus('PDF library not loaded.', 'error');
    return;
  }
  btnMergeGo.disabled = true;
  setMergeStatus('Combining…', 'info');
  try {
    const out = await PDFLib.PDFDocument.create();
    for (const file of mergeFiles) {
      const bytes = await file.arrayBuffer();
      const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    const merged = await out.save();
    let name = (mergeName.value || mergeDefaultName).trim();
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    const blob = new Blob([merged], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMergeStatus(`Combined ${mergeFiles.length} file${mergeFiles.length > 1 ? 's' : ''} → ${name}`, 'ok');
  } catch (err) {
    setMergeStatus(`Couldn't combine: ${err.message}`, 'error');
  } finally {
    btnMergeGo.disabled = mergeFiles.length < 1;
  }
}

document.getElementById('btn-merge').addEventListener('click', openMergeView);
document.getElementById('btn-merge-back').addEventListener('click', closeMergeView);
btnMergeGo.addEventListener('click', combineAndDownload);
btnMergeClear.addEventListener('click', () => { mergeFiles = []; renderMergeList(); setMergeStatus(''); });
mergeInput.addEventListener('change', () => { addMergeFiles(mergeInput.files); mergeInput.value = ''; });
['dragenter', 'dragover'].forEach((ev) => mergeDrop.addEventListener(ev, (e) => { e.preventDefault(); mergeDrop.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => mergeDrop.addEventListener(ev, (e) => { e.preventDefault(); mergeDrop.classList.remove('dragover'); }));
mergeDrop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addMergeFiles(e.dataTransfer.files); });

bindAuthForm({
  onHydrate: hydrateHome,
  onSignedIn: refreshHome,
});

document.getElementById('link-signup')?.addEventListener('click', () => openJobMaxxing('/signup'));
document.getElementById('link-forgot')?.addEventListener('click', () => openJobMaxxing('/forgot-password'));
