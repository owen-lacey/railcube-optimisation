// The crossed sweep, one track at a time; the shuffle button picks another at
// random.

import KnownTracks from './KnownTracks.svelte';

export default {
  title: 'Known tracks',
  component: KnownTracks,
  argTypes: {
    aspect: { control: 'text' },
  },
};

export const Default = {};

/** No train: the tracks alone, as the post shows them. */
export const NoTrain = {
  args: { train: null },
};
