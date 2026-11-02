// The model's own leaderboard: the crossed sweep's best layouts
// (`data/sweep-crossed-top.json`, written by scripts/rank-tracks.js) as rows of
// `Leaderboard`. A rank is the Worker's: one more than the rows scoring strictly
// higher, so ties share it. The file is a prefix of the ranking over every legal
// layout, so a rank here is the layout's rank over the whole sweep.

/**
 * `{ id, shape, score }[]`, best first, as `{ id, rank, name, score, shape }[]`,
 * each named by its sweeps.db id, zero-padded to the longest as KnownTracks does.
 */
export function rankRows(best) {
  const width = String(Math.max(...best.map(row => row.id))).length;
  let rank = 0;
  return best.map(({ id, shape, score }, i) => {
    if (i === 0 || score !== best[i - 1].score) rank = i + 1;
    return { id, rank, name: `#${String(id).padStart(width, '0')}`, score, shape };
  });
}
