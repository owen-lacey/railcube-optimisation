// A position as a chip, for prose: coordinates, or offsets from (x, y, z).

import PositionChip from './PositionChip.svelte';
import PositionChipParagraph from './PositionChipParagraph.svelte';

export default {
  title: 'Position chip',
  component: PositionChip,
  argTypes: {
    at: { control: 'object' },
    relative: { control: 'object' },
  },
};

export const Default = { args: { at: [2, -3, -2] } };

export const Relative = { args: { relative: [0, 0, -1] } };

/** Sitting in a paragraph, where the line spacing must not change. */
export const InAParagraph = { render: () => ({ Component: PositionChipParagraph }) };
