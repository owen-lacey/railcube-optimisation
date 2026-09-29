// Build a track by clicking pieces onto it — or, with the builder focused, typing
// the letters or using the arrow keys as a d-pad. Each piece slides onto the end
// of the track; backspace slides the last one back off.
//
// Everything the builder shows is `TrackViewer`'s grow mode — see `Sketch`, which
// is the same thing typed — so the three things worth watching are the same:
// pieces already down never move, a piece with nowhere to go is drawn where it was
// asked to go and pulses red, and the train appears when the loop closes.
//
// What is new is that the viewer can be handled: drag to turn it, pinch or scroll
// to zoom, and two fingers (or a right- or shift-drag) to slide it about. The frame
// starts wide and only grows, and a hand-moved view survives every piece added.

import TrackBuilder from './TrackBuilder.svelte';

export default {
  title: 'Builder',
  component: TrackBuilder,
  argTypes: {
    shape: { control: 'text' },
    pace: { control: { type: 'range', min: 0.02, max: 2, step: 0.02 } },
    speed: { control: { type: 'range', min: 0.5, max: 4, step: 0.1 } },
    aspect: { control: 'text' },
  },
};

export const Default = {
  args: { shape: '', pace: 0.1, speed: 1.2 },
  parameters: {
    docs: {
      description: {
        story: 'An empty stage. Four left curves are the smallest loop there is — the '
          + 'train sets off on the fourth.',
      },
    },
  },
};

export const PartBuilt = {
  name: 'Part-way through',
  args: { shape: 'LIRIROSOL', pace: 0.1, speed: 1.2 },
  parameters: {
    docs: {
      description: {
        story: 'The first half of the model\'s 18-cube set, `LIRIROSOLORLLSORII`. Add '
          + '`ORLLSORII` and it closes on the last piece.',
      },
    },
  },
};

export const Stuck = {
  name: 'A piece with nowhere to go',
  args: { shape: 'LLLLL', pace: 0.1, speed: 1.2 },
  parameters: {
    docs: {
      description: {
        story: 'A fifth left curve is asked to go where the first one already is. It is '
          + 'drawn there, pulsing red, and no piece can be added until it is removed.',
      },
    },
  },
};
