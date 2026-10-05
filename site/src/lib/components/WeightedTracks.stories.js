// The best and the worst of every legal crossed layout in sweeps.db, by a
// weighting of knots, poses, close calls, repeats and longest side. Drag a slider
// to change how much one matters; shuffle shows another layout tied at that end.

import WeightedTracks from './WeightedTracks.svelte';

const EVEN = { knotted: 1, poses: 1, closeCalls: 1, repeats: 1, longestSide: 1 };

export default {
  title: 'Weighted tracks',
  component: WeightedTracks,
  argTypes: {
    weights: { control: 'object' },
    aspect: { control: 'text' },
  },
};

export const Default = {
  args: { weights: EVEN },
};

/**
 * Longest side alone: the most compact layouts against the most sprawling. The
 * other weights are zero, so layouts whose knots are not read can tie, and the
 * ends say how many.
 */
export const LongestSideOnly = {
  args: { weights: { knotted: 0, poses: 0, closeCalls: 0, repeats: 0, longestSide: 1 } },
};

/** No train: the tracks alone. */
export const NoTrain = {
  args: { weights: EVEN, train: null },
};
