// How a layout's combined score is worked out. The shape must be one the site's
// data files carry, since the knot is looked up rather than read.

import ScoreMaths from './ScoreMaths.svelte';

export default {
  title: 'Score maths',
  component: ScoreMaths,
  argTypes: {
    shape: { control: 'text' },
  },
};

/** One of the ten best under equal weights: a trefoil. */
export const Good = { args: { shape: 'SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI' } };

/** One of the ten worst. */
export const Bad = { args: { shape: 'IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI' } };
