import {
  deleteApplication as deleteRemote,
  getApplication as getRemote,
  getApplications,
  saveApplication as saveRemote,
  updateApplication as updateRemote,
  wipeAllApplications,
} from './api/jobmaxxing.js';
import { fromTrackApp, toTrackApp, toTrackSummary } from './mapping.js';

export async function getIndex() {
  const { applications } = await getApplications({ limit: 500 });
  return (applications ?? []).map(toTrackSummary);
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
}
