// A proof of concept: what a layout does when nothing holds it together.
//
// The real cubes click into each other with magnets. Take those away and a
// closed loop is a stack of loose plastic — most of it unsupported, some of it
// upside down — so it collapses the moment the clock starts. cannon-es does the
// falling; the collision shapes and the world are in `src/lib/physics.js`.

import TumbleViewer from './TumbleViewer.svelte';

export default {
  title: 'Tumble',
  component: TumbleViewer,
  argTypes: {
    shape: { control: 'text' },
    drop: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    aspect: { control: 'text' },
  },
};

export const Default = {
  args: { shape: 'LIRIROSOLORLLSORII', drop: 3 },
  parameters: {
    docs: {
      description: {
        story: 'The model\'s own 18-cube set, dropped three cubes onto a floor.',
      },
    },
  },
};

export const InPlace = {
  name: 'No drop at all',
  args: { shape: 'LIRIROSOLORLLSORII', drop: 0 },
  parameters: {
    docs: {
      description: {
        story: 'The floor put directly under the lowest cube, so nothing falls before it '
          + 'starts collapsing. The pieces that were holding themselves up are the ones '
          + 'that move.',
      },
    },
  },
};

export const Ring = {
  name: 'A ring of four curves',
  args: { shape: 'LLLL', drop: 4 },
  parameters: {
    docs: {
      description: {
        story: 'Four left curves are the smallest closed loop there is, and a free-standing '
          + 'ring — so this is the clearest look at how an arc collides. Its shape is a '
          + 'chain of six boxes strung along the sweep, not the 2×2 block of cells the '
          + 'model books it into.',
      },
    },
  },
};

export const Cramped = {
  name: 'Two rings threaded together',
  args: { shape: 'SSRRIIRRLLIISSSLLS', drop: 6 },
  parameters: {
    docs: {
      description: {
        story: 'The `cramped` layout — two vertical rings threaded through each other in a '
          + 'three-cell box. Nothing in it is resting on the floor to begin with.',
      },
    },
  },
};
