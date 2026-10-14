// Two groups of pieces apart, the second turned by a button to carry on from the
// first.

import TrackRotate from './TrackRotate.svelte';

export default {
  title: 'Track rotate',
  component: TrackRotate,
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
