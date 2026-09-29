// Build a track by typing it, one letter at a time — S straight, L left curve,
// R right curve, I inside curve, O outside curve, X cross.
//
// Every other viewer here re-derives its shape through `chainTrack`, which refuses
// anything that is not already a closed loop. That is right for showing a solver's
// answer and useless for reaching one by hand, because a track being built is open
// at every keystroke but the last. This one goes through `chainOpen` instead: the
// route is drawn as far as it has got, and closure is something the caption reports
// rather than a condition of being drawn at all.
//
// Three things follow from that, and all three are visible here:
//
//   - **Pieces already down never move.** A keystroke adds one arrival and touches
//     nothing else — not a bake, not a transform. Backspace slides exactly one cube
//     back off the way it came and leaves the rest standing.
//   - **A piece with nowhere to go is drawn where it was asked to go**, overlapping
//     whatever it ran into, and flashes red there. The box stops taking letters
//     until it is backspaced away; that is the only thing that unblocks it.
//   - **The train appears when the loop closes**, and not before. There is nothing
//     for it to run on until then.
//
// The camera grows and only grows. It starts tight enough that a two-piece sketch
// is worth looking at and enlarges as the track reaches new ground, so it settles
// once the track stops spreading — and never shrinks or re-centres on a backspace,
// which would be the shot chasing the content.

import SketchViewer from './SketchViewer.svelte';

export default {
  title: 'Sketch',
  component: SketchViewer,
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
        story: 'An empty stage. Type `LLLL` for the smallest loop there is — four left '
          + 'curves — and watch the train set off on the fourth letter. `SSLLSSLL` is the '
          + 'same ring stretched into a rectangle.',
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
        story: 'The first half of the model\'s 18-cube set, `LIRIROSOLORLLSORII`. Type the '
          + 'rest — `ORLLSORII` — and it closes on the last letter. Nine cubes are already '
          + 'standing and not one of them moves while the other nine arrive.',
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
        story: 'Four left curves close a ring, so a fifth is asked to go where the first '
          + 'one already is. It is drawn there anyway, overlapping it, pulsing red — and '
          + 'the box will not take another letter until it is deleted. Drawing it rather '
          + 'than refusing it is deliberate: the overlap is the explanation.',
      },
    },
  },
};
