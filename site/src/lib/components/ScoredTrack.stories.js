// The ten best or ten worst under equal weights, each with its scorecard over the
// viewer's top-left corner.

import ScoredTrack from './ScoredTrack.svelte';

export default {
  title: 'Scored track',
  component: ScoredTrack,
  argTypes: {
    end: { control: 'select', options: ['best', 'worst'] },
  },
};

/** The ten best. */
export const Good = { args: { end: 'best' } };

/** The ten worst. */
export const Bad = { args: { end: 'worst' } };
