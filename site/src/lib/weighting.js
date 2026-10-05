// The best and the worst of the crossed sweep, by a weighting of five metrics.
//
// Knotted (better knotted), poses (more), close calls (more), repeats (fewer)
// and longest side (shorter): each is rescaled to 0–1 over the sweep, signed by
// its direction here, multiplied by its weight and summed. The data is
// `data/sweep-crossed-weights.json`, a tally of every legal layout in sweeps.db
// by its five values — and a weighted sum reads a layout only through them, so
// ranking the rows of the tally ranks all the millions of layouts, exactly.
//
// Not every layout's knot has been read (scripts/hydrate-sweeps.js --front reads
// the ones a weighting with every weight positive can turn on), so a row may be
// `knotted: null`: that many layouts, knot unknown. Each end says how many of
// those could still reach it, which is none whenever every weight is positive,
// and none when knotted weighs nothing, since then the knot cannot move a score.
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
 * reading. A row whose knot is unread is scored as `knotted` says.
 */
export function weigher(ranges) {
  const spans = NAMES.map(name => ranges[name][1] - ranges[name][0]);
  const scale = spans.filter(Boolean).reduce((a, b) => a * b / gcd(a, b), 1);
  const score = (row, weights, knotted = row.knotted) => NAMES.reduce((total, name, i) => {
    const value = name === 'knotted' ? knotted : row[name];
    return spans[i]
      ? total + (weights[name] ?? 0) * DIRECTIONS[name] * (value - ranges[name][0]) * scale / spans[i]
      : total;
  }, 0);
  return { score, scale };
}

/**
 * The rows tied at one end, with their layouts counted and the read ones'
 * examples pooled, each example carrying the row it came from; and how many
 * layouts whose knot is unread, and matters, could reach that end too. An unread
 * row scores the same either way when knotted weighs nothing, so then it simply
 * ties or does not.
 */
const end = (scored, at, reaches, scale) => {
  const sure = scored.filter(s => s.low === s.high);
  const rows = sure.filter(s => s.low === at).map(s => s.row);
  return {
    score: at / scale,
    rows,
    count: rows.reduce((n, r) => n + r.count, 0),
    unsure: scored.filter(s => s.low !== s.high && reaches(s)).reduce((n, s) => n + s.row.count, 0),
    examples: rows.flatMap(row => (row.examples ?? []).map(example => ({ ...example, row }))),
  };
};

/**
 * The best and the worst layouts under `weights` ({ knotted, poses, closeCalls,
 * repeats, longestSide }, a missing one weighing nothing). With every weight zero,
 * everything ties.
 */
export function extremes({ rows, ranges }, weights) {
  const { score, scale } = weigher(ranges);
  const scored = rows.map(row => (row.knotted === null
    ? { row, low: score(row, weights, 0), high: score(row, weights, 1) }
    : { row, low: score(row, weights), high: score(row, weights) }));
  const sure = scored.filter(s => s.low === s.high).map(s => s.low);
  const [best, worst] = [Math.max(...sure), Math.min(...sure)];
  return {
    best: end(scored, best, s => Math.max(s.low, s.high) >= best, scale),
    worst: end(scored, worst, s => Math.min(s.low, s.high) <= worst, scale),
  };
}
