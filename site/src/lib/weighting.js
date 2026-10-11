// The best and the worst of the crossed sweep, by a weighting of five metrics.
//
// Knotted (better knotted), poses (more), close calls (more), repeats (fewer)
// and longest side (shorter): each is rescaled to 0–1 over the sweep, signed by
// its direction here, multiplied by its weight and summed. A weighted sum reads a
// layout only through those five values, so the sweep is ranked by its
// combinations of them, each standing for every layout that shares it.
//
// The data is `data/sweep-crossed-weights.json`: for every slider setting, the
// `count` best and `count` worst combinations over every legal layout in
// sweeps.db, ties broken by each combination's sample shape, alphabetically. The
// file is the union of those, so ranking its rows under any slider setting gives
// that setting's ends over the whole sweep, exactly: a row kept for some other
// setting ranks below all of this setting's ends there, as it does here.
//
// These directions are not `SIGNS` in src/metrics.js: only repeats is one of its
// metrics, and adding the others there would offer them to explore.py as
// objectives it has no term for.

export const DIRECTIONS = { knotted: 1, poses: 1, closeCalls: 1, repeats: -1, longestSide: -1 };

const NAMES = Object.keys(DIRECTIONS);

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * A row's weighted score, in integers given integer weights: every term
 * multiplied through by the LCM of the ranges, so rows that tie really are equal
 * rather than a rounding apart. `scale` turns it back into the 0–1-per-metric
 * reading.
 */
export function weigher(ranges) {
  const spans = NAMES.map(name => ranges[name][1] - ranges[name][0]);
  const scale = spans.filter(Boolean).reduce((a, b) => a * b / gcd(a, b), 1);
  const score = (row, weights) => NAMES.reduce((total, name, i) => (spans[i]
    ? total + (weights[name] ?? 0) * DIRECTIONS[name] * (row[name] - ranges[name][0]) * scale / spans[i]
    : total), 0);
  return { score, scale };
}

/** The `count` entries first under `before`, in order, in one pass. */
function leaders(entries, before, count) {
  const kept = [];
  for (const entry of entries) {
    if (kept.length === count && !before(entry, kept[count - 1])) continue;
    const at = kept.findIndex(k => before(entry, k));
    kept.splice(at === -1 ? kept.length : at, 0, entry);
    if (kept.length > count) kept.pop();
  }
  return kept;
}

/**
 * The `count` best and `count` worst rows under `weights` ({ knotted, poses,
 * closeCalls, repeats, longestSide }, a missing one weighing nothing), best and
 * worst first, each `{ row, score }`. A tie goes to the row whose shape comes
 * first alphabetically, at either end.
 */
export function ends({ rows, ranges, count }, weights) {
  const { score, scale } = weigher(ranges);
  const scored = rows.map(row => ({ row, value: score(row, weights) }));
  const first = (a, b) => a.row.shape < b.row.shape;
  const best = leaders(scored, (a, b) => a.value > b.value || (a.value === b.value && first(a, b)), count);
  const worst = leaders(scored, (a, b) => a.value < b.value || (a.value === b.value && first(a, b)), count);
  const scaled = list => list.map(({ row, value }) => ({ row, score: value / scale }));
  return { best: scaled(best), worst: scaled(worst) };
}
