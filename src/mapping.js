import { toApiStatus } from './status-map.js';

export function fromApiStatus(status, notes = '') {
  if (status === 'online_assessment') return 'oa';
  if (status === 'withdrawn' && String(notes).startsWith('[ghosted]')) return 'ghosted';
  if (status === 'final_round') return 'interview';
  if (status === 'saved') return 'applied';
  const map = {
    applied: 'applied',
    interview: 'interview',
    offer: 'offer',
    rejected: 'rejected',
    withdrawn: 'ghosted',
  };
  return map[status] ?? 'applied';
}

export function fromTrackApp(app) {
  let notes = app.notes?.trim() || null;
  const status = toApiStatus(app.status || 'applied');
  if (app.status === 'ghosted' && notes && !notes.startsWith('[ghosted]')) {
    notes = `[ghosted] ${notes}`;
  }
  return {
    id: app.id || undefined,
    companyName: app.company?.trim(),
    roleTitle: app.title?.trim(),
    jobUrl: app.jobUrl ?? null,
    location: app.location?.trim() || null,
    dateApplied: app.appliedAt || null,
    status,
    jobDescription: app.description?.trim() || null,
    notes,
    sourceHost: app.sourceHost || null,
    recruitingSeason: app.season || null,
  };
}

export function toTrackApp(apiApp) {
  let notes = apiApp.notes || '';
  if (notes.startsWith('[ghosted] ')) notes = notes.slice(10);
  return {
    id: apiApp.id,
    title: apiApp.roleTitle || '',
    company: apiApp.companyName || '',
    location: apiApp.location || '',
    appliedAt: apiApp.dateApplied || null,
    status: fromApiStatus(apiApp.status, apiApp.notes),
    description: apiApp.jobDescription || '',
    notes,
    sourceHost: apiApp.sourceHost || '',
    season: apiApp.recruitingSeason || null,
    descriptionHash: apiApp.descriptionHash || null,
    jobUrl: apiApp.jobUrl || null,
    createdAt: apiApp.createdAt,
    updatedAt: apiApp.updatedAt,
  };
}

export function toTrackSummary(apiApp) {
  return {
    id: apiApp.id,
    title: apiApp.roleTitle || '',
    company: apiApp.companyName || '',
    status: fromApiStatus(apiApp.status),
    appliedAt: apiApp.dateApplied || null,
    season: apiApp.recruitingSeason || null,
    descriptionHash: apiApp.descriptionHash || null,
    sourceHost: apiApp.sourceHost || '',
  };
}
