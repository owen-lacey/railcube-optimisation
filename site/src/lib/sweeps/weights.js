// See crossed.js for why each data file has a module of its own.
import sweepCrossedWeights from '../data/sweep-crossed-weights.json' with { type: 'json' };

/**
 * The crossed sweep's ten best and ten worst under every slider setting — over
 * all of sweeps.db, not a sample — as combinations of knotted, poses, close
 * calls, repeats and longest side, each with one sample shape: the union of
 * every setting's ends. `scripts/tally-weights.js` writes it; `weighting.js` ranks it.
 */
export const SWEEP_CROSSED_WEIGHTS = sweepCrossedWeights;
