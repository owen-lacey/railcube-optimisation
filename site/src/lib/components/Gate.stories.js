// The post's ">": pressed, or sent the right arrow while it is mostly in view, it
// fades and then hands over. The page removes it then; here it is left faded.

import Gate from './Gate.svelte';

export default {
  title: 'Gate',
  component: Gate,
};

export const Default = { args: { label: 'Keep reading', onopen: () => {} } };
