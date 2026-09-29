// The button that starts and stops a component's stepping.

import PlayPause from './PlayPause.svelte';

export default {
  title: 'Play pause',
  component: PlayPause,
  argTypes: {
    playing: { control: 'boolean' },
    label: { control: 'text' },
  },
};

export const Default = {};

/** Paused, so it offers to play. */
export const Paused = { args: { playing: false } };
