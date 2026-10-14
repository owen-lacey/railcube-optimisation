// Two groups of pieces apart, the second already turned to carry on from the
// first, joined by a button.

import TrackJoin from './TrackJoin.svelte';

export default {
  title: 'Track join',
  component: TrackJoin,
  argTypes: {
    a: { control: 'text' },
    b: { control: 'text' },
    aspect: { control: 'text' },
  },
};

/** The first group ends turned, so the second turns with it. */
export const Default = { name: 'Turned', args: { a: 'SL', b: 'SLR' } };

/** The post's pair. */
export const Post = { args: { a: 'IROSIRR', b: 'SIL' } };

/** The first group leaves the orientation alone, so the second is not turned. */
export const Straight = { args: { a: 'SS', b: 'SLR' } };
