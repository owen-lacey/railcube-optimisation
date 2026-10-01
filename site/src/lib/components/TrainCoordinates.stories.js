// Where the train is, read out as it drives: a layout in its cell lattice, the
// cell it is entering in the post's x, y, z, and a slider for which piece it is on.

import TrainCoordinates from './TrainCoordinates.svelte';
import { cellScene } from '$lib/scenes.js';

export default {
  title: 'Train coordinates',
  component: TrainCoordinates,
  argTypes: {
    shape: { control: 'text' },
    readout: { control: 'inline-radio', options: ['position', 'position-pose'] },
    aspect: { control: 'text' },
    scene: { table: { disable: true } },
  },
};

export const Default = {
  name: 'Train on a slider',
  args: { shape: 'SLLIOOILLSSS', readout: 'position-pose' },
  parameters: {
    docs: {
      description: {
        story: 'The slider is one segment per piece, in route order and in the piece\'s '
          + 'colour, faded past the thumb. Played, the train steps piece to piece and the '
          + 'slider follows; dragged, it snaps to a piece and holds the train where it '
          + 'enters it. Right is a whole lap on, which is the same place as left.',
      },
    },
  },
};

/** The lattice alone, without the origin's axes. */
export const WithoutAxes = {
  args: { shape: 'SIOOLSOOLISLIISL', readout: 'position-pose', scene: cellScene },
};
