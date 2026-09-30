// The grey rounded frame every layout is shown in, with an optional footer for controls.

import LayoutViewer from './LayoutViewer.svelte';

export default {
  title: 'Layout card',
  component: LayoutViewer,
};

/** A layout in its card, with the scrubber in the footer. */
export const WithControls = { args: { shape: 'SIOLLOISLL', scrub: true } };

/** No footer: just the rounded border. */
export const Empty = { args: { shape: 'SIOLLOISLL' } };
