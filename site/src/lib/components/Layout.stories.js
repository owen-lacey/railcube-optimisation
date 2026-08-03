// Any layout, from its shape string: one letter per piece — S straight,
// L left curve, R right curve, I inside curve, O outside curve, X cross.
// Paste a shape into the control and the model either draws it or objects.

import LayoutViewer from './LayoutViewer.svelte';

export default {
  title: 'Layout',
  component: LayoutViewer,
  argTypes: {
    shape: { control: 'text' },
    aspect: { control: 'text' },
  },
};

export const Default = {
  args: { shape: 'RIORIROIRSLSISOILIOLSISLSSSI' },
};

export const NotALegalTrack = {
  name: 'Not a legal track',
  args: { shape: 'SSSS' },
  parameters: {
    docs: {
      description: {
        story: 'Four straights do not come back to the start, so `chainTrack` throws and the '
          + 'component shows the model\'s own objection rather than a drawing of nonsense.',
      },
    },
  },
};
