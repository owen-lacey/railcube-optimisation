// The poses a layout takes, ticked off as the train drives it: the slider from
// Train coordinates, with the 24 poses as chips underneath.

import PoseTracker from './PoseTracker.svelte';
import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

export default {
  title: 'Pose tracker',
  component: PoseTracker,
  argTypes: {
    shape: { control: 'text' },
    aspect: { control: 'text' },
    scene: { table: { disable: true } },
  },
};

export const Default = {
  name: 'Poses ticked off',
  args: { shape: SWEEP_CROSSED_RANKED.best[0].shape },
  parameters: {
    docs: {
      description: {
        story: 'A column per floor, its four headings down it. A chip is ticked once the '
          + 'train has entered a piece in that pose, so dragging the slider back un-ticks '
          + 'what it has not reached yet.',
      },
    },
  },
};

/** A flat ring: the floor never changes, so one column fills and nothing else. */
export const Flat = {
  args: { shape: 'LLLL' },
};
