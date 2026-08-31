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
  return STATUS_TO_API[status] ?? 'saved';
}

export function formatStatusLabel(status) {
  const labels = {
    saved: 'Saved',
    applied: 'Applied',
    online_assessment: 'OA',
    interview: 'Interview',
    final_round: 'Final round',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
  };
  return labels[status] ?? status;
}
