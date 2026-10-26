// One orientation pictured in one cell, saved as a picture for `OrientationChip`.
// Pick the orientation in the `orientation` control — floor then heading, `DF`
// standing on the down face heading forwards — and the download button saves
// `<orientation>.png`, for `site/src/lib/assets/orientations/`.

import OrientationSnapshotViewer from './OrientationSnapshotViewer.svelte';
import { POSES } from '../../../../src/track.js';

export default {
  title: 'Orientation snapshot',
  component: OrientationSnapshotViewer,
  argTypes: {
    orientation: { control: 'select', options: POSES },
    size: { control: { type: 'range', min: 40, max: 240, step: 10 } },
  },
};

export const Default = {
  args: { orientation: 'DF', size: 120 },
};
