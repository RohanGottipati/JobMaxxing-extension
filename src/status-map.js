const STATUS_TO_API = {
  saved: 'saved',
  applied: 'applied',
  oa: 'online_assessment',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  ghosted: 'withdrawn',
};

export function toApiStatus(status) {
  return STATUS_TO_API[status] ?? 'applied';
}

export const STATUS_LABEL = {
  applied: 'Applied',
  oa: 'OA',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};
