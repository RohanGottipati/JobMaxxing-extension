const TERMS = [
  { label: 'Winter', month: 0 },
  { label: 'Summer', month: 4 },
  { label: 'Fall', month: 8 },
];

export function recruitingSeasons(now = new Date(), count = 6) {
  const firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const seasons = [];

  for (let year = now.getFullYear(); seasons.length < count; year += 1) {
    for (const term of TERMS) {
      if (new Date(year, term.month, 1) < firstMonth) continue;
      seasons.push(`${term.label} ${year}`);
      if (seasons.length === count) break;
    }
  }

  return seasons;
}
