// The ten best of every legal crossed layout in sweeps.db, by a weighting of
// knots, poses, close calls, repeats and longest side. Drag a weight's slider in
// the maths to change how many points it is worth; the tiles re-rank and the first is
// picked.

import WeightedTracks from './WeightedTracks.svelte';
import { WEIGHTS } from '$lib/weighting.js';

export default {
  title: 'Weighted tracks',
  component: WeightedTracks,
  argTypes: {
    weights: { control: 'object' },
  },
};

export const Default = {
  args: { weights: WEIGHTS },
};

/**
 * Longest side alone: the most compact layouts. The other weights are zero, so
 * the ten are ties, in alphabetical order.
 */
export const LongestSideOnly = {
  args: { weights: { knotted: 0, poses: 0, closeCalls: 0, repeats: 0, longestSide: 1 } },
};

/** No train: the tracks alone. */
export const NoTrain = {
  args: { weights: WEIGHTS, train: null },
};
