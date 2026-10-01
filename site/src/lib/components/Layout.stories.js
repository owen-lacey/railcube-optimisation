// Any layout, from its shape string: one letter per piece — S straight,
// L left curve, R right curve, I inside curve, O outside curve, X cross.
// Paste a shape into the control and the model either draws it or objects.
//
// **Changing the shape rearranges the cubes rather than replacing them.** The
// layout that is there collapses onto the ground, and the new one is built out of the
// pieces that fall — the same physical cubes, picked up and carried to new slots.
// Which cube goes where is decided by piece ID: `2L` is the second left curve of a
// shape in route order, and the second left curve of the next shape is the same
// cube. See `identify` in `src/layouts.js`.
//
// The first render is not animated. There is nothing on the floor to pick up yet,
// so it is simply drawn finished and driven.

import LayoutViewer from './LayoutViewer.svelte';

export default {
  title: 'Layout',
  component: LayoutViewer,
  argTypes: {
    shape: { control: 'text' },
    pace: { control: { type: 'range', min: 0.02, max: 2, step: 0.02 } },
    speed: { control: { type: 'range', min: 0.5, max: 4, step: 0.1 } },
    handover: { control: { type: 'range', min: 0, max: 3, step: 0.05 } },
    drop: { control: { type: 'range', min: 0, max: 6, step: 1 } },
    aspect: { control: 'text' },
    grid: { control: 'boolean' },
    blueprint: { control: 'boolean' },
    trainCaption: { control: 'boolean' },
    origin: { control: 'boolean' },
    scrub: { control: 'boolean' },
    change: { control: 'inline-radio', options: ['none', 'tumble', 'build'] },
  },
};

export const Default = {
  args: { shape: 'RIORIROIRSLSISOILIOLSISLSSSI', change: 'tumble', pace: 0.04, speed: 1.2, handover: 0.5, drop: 2 },
  parameters: {
    docs: {
      description: {
        story: 'The whole starter set, 28 cubes. Type any other legal shape over it and '
          + 'watch it come apart and go back together. Because the pieces are reused, a '
          + 'shape needing fewer of a type leaves the rest lying on the floor — which is '
          + 'honest about the inventory, and makes it obvious when a layout does not spend '
          + 'everything.',
      },
    },
  },
};

export const Rearranged = {
  name: 'The same cubes, twice',
  args: { shape: 'LIRIROSOLORLLSORII', change: 'tumble', pace: 0.04, speed: 1.2, handover: 0.5, drop: 2 },
  parameters: {
    docs: {
      description: {
        story: 'The model\'s own 18-cube set. Paste `LRRIIOOSRLLOOLSRII` — a different '
          + '18-cube layout of the same score, found independently on native OR-Tools — and '
          + 'nothing is left over, because the two spend exactly the same pieces. That is '
          + 'the sequence at its clearest: one set of cubes, two answers.\n\n'
          + 'The camera never moves. It is not framed on the layout at all but on a fixed box '
          + 'six cells around the start cell — the same box the solver is constrained to — so '
          + 'there is nothing for a shape change to reframe, and a shot that moves while '
          + 'eighteen cubes are collapsing is a shot nobody can read. The price is that every '
          + 'layout is drawn smaller than it would be framed on its own, and sits wherever it '
          + 'happens to sit in the box. `drop` is the one dial: every extra cube of fall is '
          + 'more scale given up.\n\n'
          + '`handover` is when the build joins in, measured from the moment the track is '
          + 'let go of. The two animations *overlap*, so pieces are plucked out of a pile '
          + 'that is still falling rather than off one that has finished — which is what '
          + 'makes it possible to start early at all. Turn it down to nearly nothing and '
          + 'the track barely collapses before it reassembles; turn it up and you watch the '
          + 'whole fall first.\n\n'
          + '`speed` is one tempo over the assembly itself — the gap between pieces, the '
          + 'lift, the slide and the pause before the train — scaled together so the '
          + 'proportions the easings are tuned against are preserved. `pace` is separate '
          + 'for the one case worth setting alone: stretching only the gap, to watch a '
          + 'single arrival.',
      },
    },
  },
};

export const Grid = {
  name: 'In its grid',
  args: { shape: 'LLLL', grid: true, interactive: true },
  parameters: {
    docs: {
      description: {
        story: 'The cells the model reasons in, drawn. One cell is one straight cube; a '
          + 'curve fills a 2×2 block of them, and the train needs the cells on the rail '
          + 'side of each piece. The lattice covers every cell the cubes *and* the train '
          + 'touch, empty ones included. Drag to orbit.',
      },
    },
  },
};

export const Blueprint = {
  name: 'On a blueprint',
  args: { shape: 'LIRIROSOLORLLSORII', interactive: true },
  parameters: {
    docs: {
      description: {
        story: 'The viewer drawn on a sheet of dots, edge to edge, so it is plain where '
          + 'the part that can be handled begins and ends. The sheet lies flat on the '
          + 'screen, so no angle loses it, but it follows the camera\'s zoom and pan — '
          + 'scroll or pinch and the dots spread, shift-drag and they slide with the '
          + 'track. Orbiting leaves it still, as a sheet of paper would.',
      },
    },
  },
};

export const Scrubbed = {
  name: 'Train on a slider',
  args: {
    shape: 'SLLIOOILLSSS', grid: true, trainCaption: true, origin: true, scrub: true,
    interactive: true,
  },
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

export const NotALegalTrack = {
  name: 'Not a legal track',
  args: { shape: 'SSSS' },
  parameters: {
    docs: {
      description: {
        story: 'Four straights do not come back to the start, so `chainTrack` throws and the '
          + 'component shows the model\'s own objection rather than a drawing of nonsense. '
          + 'The viewer is unmounted with it, so the cubes go too — the next legal shape has '
          + 'nothing to knock down and is drawn finished, like a first render.',
      },
    },
  },
};
