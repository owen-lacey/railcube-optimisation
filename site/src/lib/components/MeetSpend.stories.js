// The meet-in-the-middle's last step: loops paired up on the inventory they spend.

import MeetSpend from './MeetSpend.svelte';

export default {
  title: 'Meet figure/Spend',
  component: MeetSpend,
  argTypes: {
    camera: { control: 'inline-radio', options: ['follow', 'fixed'] },
    aspect: { control: 'text' },
  },
};

export const Default = {};

/** The tracks held in one shot rather than followed. */
export const Fixed = { args: { camera: 'fixed' } };
