const STATUS_TO_API = {
  saved: 'saved',
  applied: 'applied',
  online_assessment: 'online_assessment',
  oa: 'online_assessment',
  interview: 'interview',
  final_round: 'final_round',
  offer: 'offer',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  ghosted: 'withdrawn',
};

export function toApiStatus(status) {
  return STATUS_TO_API[status] ?? 'applied';
}

export const STATUS_LABEL = {
  saved: 'Saved',
  applied: 'Applied',
  online_assessment: 'Online Assessment',
  interview: 'Interview',
  final_round: 'Final Round',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
