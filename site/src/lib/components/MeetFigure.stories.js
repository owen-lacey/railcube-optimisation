// How the meet-in-the-middle generator makes a crossed layout, stepped through on
// one fixed layout of the crossed sweep.

import MeetFigure from './MeetFigure.svelte';

export default {
  title: 'Meet figure',
  component: MeetFigure,
  argTypes: {
    aspect: { control: 'text' },
  },
};

/** The first segment built, then its finishing pose. */
export const Default = {};
