// The post's title screen, spelled in Rail Cube letters.

import Splash from './Splash.svelte';

export default {
  title: 'Splash',
  component: Splash,
  parameters: { layout: 'fullscreen' },
};

// The page removes the splash once it has faded; here it is left faded.
export const Default = { args: { onnext: () => {} } };
