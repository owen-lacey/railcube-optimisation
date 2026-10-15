// The combined score worked out for one layout, and the crossed sweep's hundred
// best under equal weights as tiles docked along the viewer's bottom to pick it
// from.

import ScoredRanking from './ScoredRanking.svelte';

export default {
  title: 'Scored ranking',
  component: ScoredRanking,
};

export const Default = {};

/** No train: the tracks alone. */
export const NoTrain = { args: { train: null } };
