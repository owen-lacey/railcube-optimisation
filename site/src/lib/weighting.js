// The best and the worst of the crossed sweep, by a weighting of five metrics.
//
// Knotted (better knotted), poses (more), close calls (more), repeats (fewer)
// and longest side (shorter): each is worth a whole number of points per unit,
// its weight, signed by its direction here, and the points are summed. Knotted is
// 0 or 1, so its weight is the points a knot brings. A weighted sum reads a layout
// only through those five values, so the sweep is ranked by its combinations of
// them, each standing for every layout that shares it.
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

/** Each metric's name on screen, in DIRECTIONS order. */
export const LABELS = { knotted: 'Knotted', poses: 'Orientations', closeCalls: 'Close calls', repeats: 'Repeats', longestSide: 'Longest side' };

/** The post's weighting, points per unit: a knot is worth ten, everything else one. */
export const WEIGHTS = { knotted: 10, poses: 1, closeCalls: 1, repeats: 1, longestSide: 1 };

/** How far each slider goes, and so every weighting the tally covers. */
export const MAX_WEIGHTS = { knotted: 20, poses: 5, closeCalls: 5, repeats: 5, longestSide: 5 };

const NAMES = Object.keys(DIRECTIONS);

/** A row's score under `weights`, a missing one weighing nothing: whole numbers, so ties are exact. */
export const scoreOf = (row, weights) => NAMES.reduce(
  (total, name) => total + (weights[name] ?? 0) * DIRECTIONS[name] * row[name], 0);

/**
 * A row's score written out term by term, for showing the working: per metric
 * its `value`, its `points` each (weight × DIRECTIONS) and the `contribution`
 * (value × points), in DIRECTIONS order, and their `total`, which is `scoreOf`.
 */
export function termsOf(row, weights) {
  const terms = NAMES.map(name => {
    const points = (weights[name] ?? 0) * DIRECTIONS[name];
    return { name, value: row[name], points, contribution: row[name] * points };
  });
  return { terms, total: terms.reduce((sum, t) => sum + t.contribution, 0) };
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
export function ends({ rows, count }, weights) {
  const scored = rows.map(row => ({ row, score: scoreOf(row, weights) }));
  const first = (a, b) => a.row.shape < b.row.shape;
  const best = leaders(scored, (a, b) => a.score > b.score || (a.score === b.score && first(a, b)), count);
  const worst = leaders(scored, (a, b) => a.score < b.score || (a.score === b.score && first(a, b)), count);
  return { best, worst };
}

/** Every weighting the sliders can set, all-zero included, each weight 0 to its MAX_WEIGHTS. */
export const settings = () => NAMES.reduce(
  (at, name) => at.flatMap(w => Array.from({ length: MAX_WEIGHTS[name] + 1 }, (_, v) => ({ ...w, [name]: v }))),
  [{}]);
