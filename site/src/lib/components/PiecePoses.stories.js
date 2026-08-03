// The same six pieces, each in all 24 of its valid poses: one row per face
// (up, down, front, back, left, right), one column per heading.

import PieceViewer from './PieceViewer.svelte';

export default {
  title: 'Pieces/Poses',
  component: PieceViewer,
  args: { poses: true },
  argTypes: {
    type: { table: { disable: true } },
    poses: { table: { disable: true } },
  },
};

const story = type => ({ args: { type } });

export const Straight = story('straight');
export const LeftCurve = story('leftCurve');
export const RightCurve = story('rightCurve');
export const InsideCurve = story('insideCurve');
export const OutsideCurve = story('outsideCurve');
export const Cross = story('cross');
