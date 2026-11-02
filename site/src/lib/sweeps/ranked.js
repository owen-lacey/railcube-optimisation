// See crossed.js for why each data file has a module of its own.
import sweepCrossedRanked from '../data/sweep-crossed-ranked.json' with { type: 'json' };

/**
 * The crossed sweep's best and worst layouts under the post's weights — the order
 * `weighting.js` scores them in at WeightedTracks' default sliders — ranked over
 * all of sweeps.db, ties broken by a seeded draw, mirrors left out.
 * `scripts/rank-tracks.js` writes it.
 */
export const SWEEP_CROSSED_RANKED = sweepCrossedRanked;
