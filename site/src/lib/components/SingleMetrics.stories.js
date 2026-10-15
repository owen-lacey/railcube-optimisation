// The crossed sweep's best layout on each metric alone, a tab per metric.

import SingleMetrics from './SingleMetrics.svelte';

export default {
  title: 'Single metrics',
  component: SingleMetrics,
  argTypes: {
    aspect: { control: 'text' },
  },
};

export const Default = {};

/** No train: the tracks alone. */
export const NoTrain = { args: { train: null } };
