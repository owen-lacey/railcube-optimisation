// Two groups of pieces, drawn apart, then turned, then joined by a button: the
// track generator's sums, one story per step of its section.

import TrackSum from './TrackSum.svelte';

export default {
  title: 'Track sum',
  component: TrackSum,
  argTypes: {
    a: { control: 'text' },
    b: { control: 'text' },
    aspect: { control: 'text' },
  },
};

/** The first group leaves the orientation alone, so joining is only a slide. */
export const Default = { name: 'Simple', args: { a: 'SS', b: 'SLR' } };

/** The same second group, but the first ends turned, so it turns as it joins. */
export const Turned = { args: { a: 'SL', b: 'SLR' } };

/** Two halves of the opening's O, which close once joined. */
export const Complete = { args: { a: 'SIOSLL', b: 'SOISLL' } };

/** A lobe back to the crossroads, side on. */
export const Half = { args: { a: 'XSR', b: 'RRS' } };

/** The lobe through the cross and a second lobe: a figure eight. */
export const Full = { args: { a: 'XSLLLSX', b: 'SRRRS' } };
