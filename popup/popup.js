import { bindAuthForm } from '../src/auth-gate.js';
import { MSG, send } from '../src/messages.js';
import { openJobMaxxing } from '../src/api/jobmaxxing.js';

const SEASONS = ['Summer 2027', 'Winter 2027'];
let editingId = null;
let scrapedJobUrl = null;

const home = document.getElementById('home');
const appCount = document.getElementById('app-count');
const formView = document.getElementById('form-view');
const formTitle = document.getElementById('form-title');
const fId = document.getElementById('f-id');
const fTitle = document.getElementById('f-title');
const fCompany = document.getElementById('f-company');
const fLocation = document.getElementById('f-location');
const fDate = document.getElementById('f-date');
const fStatus = document.getElementById('f-status');
const fSeason = document.getElementById('f-season');
const fUrl = document.getElementById('f-url');
const fDesc = document.getElementById('f-desc');
const fNotes = document.getElementById('f-notes');
const fDupe = document.getElementById('f-dupe');
const btnDelete = document.getElementById('btn-delete');
const btnSave = document.getElementById('btn-save');
const mergeView = document.getElementById('merge-view');

SEASONS.forEach((s) => fSeason.appendChild(new Option(s, s)));

async function loadCount() {
  try {
    const res = await send(MSG.GET_INDEX);
    appCount.textContent = (res.index || []).length || '';
  } catch {
    appCount.textContent = '';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && formView.style.display !== 'none') closeForm();
  if (e.key === 'Escape' && mergeView.style.display !== 'none') closeMergeView();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && formView.style.display !== 'none') saveForm();
});

document.getElementById('btn-add').addEventListener('click', () => openAddForm());
document.getElementById('btn-open-web').addEventListener('click', () => openJobMaxxing('/applications'));

document.getElementById('btn-grab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const res = await send(MSG.SCRAPE_TAB, { tabId: tab.id });
    const scraped = res?.scraped || {};
    openAddForm({
      title: scraped.title,
      company: scraped.company,
      location: scraped.location,
      description: scraped.description,
      sourceHost: scraped.sourceHost,
      jobUrl: scraped.jobUrl,
    });
  } catch {
    openAddForm({ title: '', company: '', description: '' });
  }
});

function openAddForm(prefill = {}) {
  editingId = null;
  scrapedJobUrl = prefill.jobUrl || null;
  formTitle.textContent = 'New Role';
  fId.value = '';
  fTitle.value = prefill.title || '';
  fCompany.value = prefill.company || '';
  fLocation.value = prefill.location || '';
  fDate.value = prefill.appliedAt || '';
  fStatus.value = prefill.status || 'saved';
  fSeason.value = prefill.season || '';
  fUrl.value = prefill.jobUrl || '';
  fDesc.value = prefill.description || '';
  fNotes.value = prefill.notes || '';
  fDupe.style.display = 'none';
  btnDelete.style.display = 'none';
  btnSave.disabled = false;
  btnSave.textContent = 'Save role';
  home.style.display = 'none';
  formView.style.display = 'flex';
}

function closeForm() {
  formView.style.display = 'none';
  home.style.display = 'flex';
  editingId = null;
  scrapedJobUrl = null;
}

async function saveForm() {
  const title = fTitle.value.trim();
  const company = fCompany.value.trim();
  if (!title || !company) {
    const missing = title ? fCompany : fTitle;
    missing.reportValidity?.();
    missing.focus();
    return;
  }

  btnSave.disabled = true;
  btnSave.textContent = 'Saving…';

  const app = {
    id: fId.value || crypto.randomUUID(),
    title,
    company,
    location: fLocation.value.trim(),
    appliedAt: fDate.value || null,
    status: fStatus.value,
    season: fSeason.value || null,
    description: fDesc.value.trim(),
    notes: fNotes.value.trim(),
    jobUrl: fUrl.value.trim() || scrapedJobUrl,
  };

  const msgType = editingId ? MSG.UPDATE_APPLICATION : MSG.SAVE_APPLICATION;
  let res;
  try {
    res = await send(msgType, { app });
  } catch (err) {
    showFormError(`Save failed: ${err.message}`);
    btnSave.disabled = false;
    btnSave.textContent = 'Save role';
    return;
  }

  if (!res || res.error || res.ok === false) {
    showFormError(`Save failed: ${res?.error || 'unknown error'}`);
    btnSave.disabled = false;
    btnSave.textContent = 'Save role';
    return;
  }

  if (res.dupe) {
    fDupe.textContent = '⚠ This looks like a duplicate of an existing application.';
    fDupe.style.display = 'block';
    btnSave.disabled = false;
    btnSave.textContent = 'Save role';
    return;
  }

  closeForm();
  await loadCount();
}

document.getElementById('btn-back').addEventListener('click', closeForm);
btnSave.addEventListener('click', saveForm);
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this application?')) return;
  await send(MSG.DELETE_APPLICATION, { id: editingId });
  closeForm();
  await loadCount();
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

function openMergeView() {
  mergeFiles = [];
  renderMergeList();
  setMergeStatus('');
  mergeName.value = 'combined.pdf';
  home.style.display = 'none';
  mergeView.style.display = 'flex';
}
function closeMergeView() {
  mergeView.style.display = 'none';
  home.style.display = 'flex';
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
    let name = (mergeName.value || 'combined.pdf').trim();
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

bindAuthForm({ onSignedIn: loadCount });
