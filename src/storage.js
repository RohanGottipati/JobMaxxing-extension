import {
  deleteApplication as deleteRemote,
  getApplication as getRemote,
  getApplications,
  saveApplication as saveRemote,
  updateApplication as updateRemote,
  wipeAllApplications,
} from './api/jobmaxxing.js';
import { fromTrackApp, toTrackApp, toTrackSummary } from './mapping.js';

const INDEX_KEY = 'jobmaxxing.index';

export async function getCachedIndex() {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return result[INDEX_KEY] ?? null;
}

async function storeIndex(index) {
  await chrome.storage.local.set({ [INDEX_KEY]: index ?? [] });
}

export async function clearIndexCache() {
  await chrome.storage.local.remove(INDEX_KEY);
}

export async function getIndex() {
  const { applications } = await getApplications({ limit: 500 });
  const index = (applications ?? []).map(toTrackSummary);
  await storeIndex(index);
  return index;
}

export async function getApplication(id) {
  const { application } = await getRemote(id);
  return application ? toTrackApp(application) : null;
}

export async function saveApplication(app) {
  const payload = fromTrackApp(app);
  const result = await saveRemote(payload);
  if (result.duplicate) return { duplicate: result.duplicate };
  return toTrackApp(result.application);
}

export async function updateApplication(app) {
  const payload = fromTrackApp(app);
  const result = await updateRemote(payload);
  if (result.duplicate) return { duplicate: result.duplicate };
  return toTrackApp(result.application);
}

export async function deleteApplication(id) {
  await deleteRemote(id);
}

export async function getAllApplications() {
  const { applications } = await getApplications({ full: true });
  return (applications ?? []).map(toTrackApp);
}

export async function repairIndex() {
  return getIndex();
}

export async function wipeAll() {
  await wipeAllApplications();
  await clearIndexCache();
}
