// See crossed.js for why each data file has a module of its own.
import sweepCrossedScores from '../data/sweep-crossed-scores.json' with { type: 'json' };

/**
 * How many of the crossed sweep's layouts score each score under the post's
 * weights, as `[score, count]` pairs over the ranked file's population, for the
 * verdict a builder's closed loop is shown against. `scripts/score-histogram.js`
 * writes it.
 */
export const SWEEP_CROSSED_SCORES = sweepCrossedScores;
