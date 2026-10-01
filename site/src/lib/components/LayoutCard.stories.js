// The grey rounded frame every layout is shown in, with an optional footer for controls.

import LayoutViewer from './LayoutViewer.svelte';
import TrainCoordinates from './TrainCoordinates.svelte';

export default {
  title: 'Layout card',
  component: LayoutViewer,
};

/** A layout in its card, with a caption and the scrubber in the footer. */
export const WithControls = {
  render: () => ({ Component: TrainCoordinates, props: { shape: 'SIOLLOISLL' } }),
};

/** No footer: just the rounded border. */
export const Empty = { args: { shape: 'SIOLLOISLL' } };
