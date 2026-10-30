// How the meet-in-the-middle generator makes a crossed layout, stepped through on
// one fixed layout of the crossed sweep.

import MeetFigure from './MeetFigure.svelte';

export default {
  title: 'Meet figure',
  component: MeetFigure,
  argTypes: {
    aspect: { control: 'text' },
    camera: { control: 'inline-radio', options: ['follow', 'fixed'] },
  },
};

/** The first segment built, its finishing pose, then the search for its second. */
export const Default = {};

/** The same, the trials held in one shot rather than followed. */
export const Fixed = { args: { camera: 'fixed' } };
