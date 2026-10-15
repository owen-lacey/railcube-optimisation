// A layout's five readings. The shape must be one the site's data files carry,
// since the knot is looked up rather than read.

import Scorecard from './Scorecard.svelte';

export default {
  title: 'Scorecard',
  component: Scorecard,
  argTypes: {
    shape: { control: 'text' },
  },
};

/** One of the ten best under equal weights: a trefoil. */
export const Good = { args: { shape: 'SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI' } };

/** One of the ten worst. */
export const Bad = { args: { shape: 'IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI' } };
