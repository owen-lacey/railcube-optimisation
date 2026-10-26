// An orientation as a chip, for prose: hover, focus or tap it for its picture.

import OrientationChip from './OrientationChip.svelte';
import OrientationChipParagraph from './OrientationChipParagraph.svelte';
import { POSES } from '../../../../src/track.js';

export default {
  title: 'Orientation chip',
  component: OrientationChip,
  argTypes: {
    orientation: { control: 'select', options: POSES },
  },
};

export const Default = { args: { orientation: 'DF' } };

/** Sitting in a paragraph, where the line spacing must not change. */
export const InAParagraph = { render: () => ({ Component: OrientationChipParagraph }) };
