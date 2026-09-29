// The train in all 24 poses inside one cube, snapping from one to the next.

import PoseCycle from './PoseCycle.svelte';

export default {
  title: 'Pose cycle',
  component: PoseCycle,
  argTypes: {
    interval: { control: { type: 'range', min: 0.25, max: 3, step: 0.25 } },
  },
};

export const Default = {};
