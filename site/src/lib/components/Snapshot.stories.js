// A shape looked at square on, saved as a picture. Type the letters into the
// `shape` control — S straight, L left curve, R right curve, I inside curve,
// O outside curve, X cross — and the download button saves a PNG of it.
//
// The buttons pick which face of the box to look from (above, below, front,
// behind, left, right) and turn the picture clockwise or anticlockwise by
// quarters. Unturned, up is up the screen from the side, and forwards is up it
// from above or below. The viewer is sized to the shape's outline from there, so
// the PNG is clipped to exactly the cubes, on a transparent background. Open
// routes are drawn as far as they go; a piece with nowhere to go shows red where
// it was asked to land.

import SnapshotViewer from './SnapshotViewer.svelte';

export default {
  title: 'Snapshot',
  component: SnapshotViewer,
  argTypes: {
    shape: { control: 'text' },
    perCube: { control: { type: 'range', min: 20, max: 200, step: 10 } },
  },
};

export const Default = {
  args: { shape: 'SSSSRRSSSS', perCube: 60 },
};
