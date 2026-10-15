// How a layout's combined score is worked out. The shapes must be ones the site's
// data files carry, since `readingsOf` looks the knot up rather than reading it.

import ScoreMaths from './ScoreMaths.svelte';
import { readingsOf } from '$lib/readings.js';

export default {
  title: 'Score maths',
  component: ScoreMaths,
};

/** One of the ten best under equal weights: a trefoil. */
export const Good = { args: { readings: readingsOf('SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI') } };

/** One of the ten worst. */
export const Bad = { args: { readings: readingsOf('IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI') } };

/** No track yet: every value a dash. */
export const Empty = { args: { readings: null } };
