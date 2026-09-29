// One card per piece type: the piece, outlined in its colour, over its letter.

import PieceCard from './PieceCard.svelte';
import PieceCardGrid from './PieceCardGrid.svelte';

export default {
  title: 'Piece card',
  component: PieceCard,
  argTypes: {
    type: { table: { disable: true } },
  },
};

export const Straight = { args: { type: 'straight' } };
export const LeftCurve = { args: { type: 'leftCurve' } };
export const RightCurve = { args: { type: 'rightCurve' } };
export const InsideCurve = { args: { type: 'insideCurve' } };
export const OutsideCurve = { args: { type: 'outsideCurve' } };
export const Cross = { args: { type: 'cross' } };

/** All six at once, wrapping to the width available. */
export const All = { render: () => ({ Component: PieceCardGrid }) };
