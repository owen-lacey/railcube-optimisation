// The meet-in-the-middle's search for each loop's last segment, a carousel of attempts.

import MeetLoop from './MeetLoop.svelte';

export default {
  title: 'Meet figure/Loop',
  component: MeetLoop,
  argTypes: {
    loop: { control: 'inline-radio', options: ['a', 'b'] },
    camera: { control: 'inline-radio', options: ['follow', 'fixed'] },
    aspect: { control: 'text' },
  },
};

/** Loop A's second segment, searched for on from its first. */
export const LoopA = { args: { loop: 'a' } };

/** Loop B's last segment, searched for on from the rest of the track. */
export const LoopB = { args: { loop: 'b' } };

/** Loop A, the trials held in one shot rather than followed. */
export const Fixed = { args: { loop: 'a', camera: 'fixed' } };
