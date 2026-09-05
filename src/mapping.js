import { toApiStatus } from './status-map.js';

export function fromApiStatus(status, notes = '') {
  void notes;
  return [
    'saved',
    'applied',
    'online_assessment',
    'interview',
    'final_round',
    'offer',
    'rejected',
    'withdrawn',
  ].includes(status)
    ? status
    : 'applied';
}

export function fromTrackApp(app) {
  const notes = app.notes?.trim() || null;
  const status = toApiStatus(app.status || 'applied');
  return {
    id: app.id || undefined,
    companyName: app.company?.trim(),
    roleTitle: app.title?.trim(),
    jobUrl: app.jobUrl ?? null,
    location: app.location?.trim() || null,
    dateApplied: app.appliedAt || null,
    deadline: app.deadline || null,
    nextAction: app.nextAction?.trim() || null,
    status,
    jobDescription: app.description?.trim() || null,
    notes,
    referralContact: app.referralContact?.trim() || null,
    sourceHost: app.sourceHost || null,
    recruitingSeason: app.season || null,
    ...(app.submittedFiles ? { submittedFiles: app.submittedFiles } : {}),
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
    deadline: apiApp.deadline || null,
    nextAction: apiApp.nextAction || '',
    status: fromApiStatus(apiApp.status, apiApp.notes),
    description: apiApp.jobDescription || '',
    notes,
    referralContact: apiApp.referralContact || '',
    sourceHost: apiApp.sourceHost || '',
    season: apiApp.recruitingSeason || null,
    descriptionHash: apiApp.descriptionHash || null,
    jobUrl: apiApp.jobUrl || null,
    submittedResumeVersionId: apiApp.submittedResumeVersionId || null,
    submittedCoverLetterId: apiApp.submittedCoverLetterId || null,
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
    jobUrl: apiApp.jobUrl || null,
    updatedAt: apiApp.updatedAt || null,
  };
}
