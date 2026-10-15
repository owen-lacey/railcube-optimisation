// A track with its scorecard over the viewer's top-left corner. The shape must be
// one the site's data files carry, since the knot is looked up rather than read.

import ScoredTrack from './ScoredTrack.svelte';

export default {
  title: 'Scored track',
  component: ScoredTrack,
  argTypes: {
    shape: { control: 'text' },
  },
};

/** One of the ten best under equal weights: a trefoil. */
export const Good = { args: { shape: 'SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI' } };

/** One of the ten worst. */
export const Bad = { args: { shape: 'IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI' } };
