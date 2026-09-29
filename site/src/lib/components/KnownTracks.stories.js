// The crossed sweep, a random track at a time. Type a number from 1 to 1,000 to
// hold that one; play sets it cycling again, and pause holds the train too. Nothing changes while it is off
// screen, since every swap redraws a whole 35-cube layout.

import KnownTracks from './KnownTracks.svelte';

export default {
  title: 'Known tracks',
  component: KnownTracks,
  argTypes: {
    every: { control: { type: 'range', min: 500, max: 10000, step: 100 } },
    aspect: { control: 'text' },
    drive: { control: 'boolean' },
  },
};

export const Default = {
  args: { every: 2000, drive: true },
};
