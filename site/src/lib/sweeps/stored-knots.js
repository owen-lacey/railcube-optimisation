// The knots the site's data files store, by shape. A knot is read for the sweeps
// by topoly in Python (scripts/knots.py); a swept layout's is looked up here rather
// than read again. A module of its own because it pulls in every file that stores
// one, which a page that only shows one of them should not.
import sweepCrossed from '../data/sweep-crossed.json' with { type: 'json' };
import sweepCrossedWeights from '../data/sweep-crossed-weights.json' with { type: 'json' };
import sweepCrossedRanked from '../data/sweep-crossed-ranked.json' with { type: 'json' };
import sweepCrossedSingles from '../data/sweep-crossed-singles.json' with { type: 'json' };

const KNOTS = new Map([
  ...sweepCrossed.shapes,
  ...sweepCrossedWeights.rows,
  ...sweepCrossedRanked.best,
  ...sweepCrossedRanked.worst,
  ...sweepCrossedSingles.layouts,
].map(({ shape, knot }) => [shape, knot]));

/** The stored knot of a crossed layout: 'unknot', 'trefoil', … Throws for a shape no file carries. */
export function knotOf(shape) {
  const knot = KNOTS.get(shape);
  if (!knot) throw new Error(`no stored knot for ${shape}`);
  return knot;
}
