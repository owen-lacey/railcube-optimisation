// The crossed sweep's ten best and ten worst layouts under equal weights, stepped
// through by hand.

import RankedTracks from './RankedTracks.svelte';

export default {
  title: 'Ranked tracks',
  component: RankedTracks,
  argTypes: {
    end: { control: 'inline-radio', options: ['best', 'worst'] },
    aspect: { control: 'text' },
  },
};

export const Best = { args: { end: 'best' } };

export const Worst = { args: { end: 'worst' } };

/** No train: the tracks alone. */
export const NoTrain = { args: { end: 'best', train: null } };
