// See crossed.js for why each data file has a module of its own.
import sweepCrossedSingles from '../data/sweep-crossed-singles.json' with { type: 'json' };

/**
 * The crossed sweep's best layout on each metric alone: one per metric `weighting.js`
 * weighs, at that metric's best, and of those the lowest on the other four under
 * the post's weights. `scripts/single-metrics.js` writes it.
 */
export const SWEEP_CROSSED_SINGLES = sweepCrossedSingles;
