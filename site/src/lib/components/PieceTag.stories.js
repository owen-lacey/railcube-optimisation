// A piece's letter as an inline badge, for prose.

import PieceTag from './PieceTag.svelte';
import PieceTagParagraph from './PieceTagParagraph.svelte';

export default {
  title: 'Piece tag',
  component: PieceTag,
};

export const Straight = { args: { letter: 'S' } };
export const LeftCurve = { args: { letter: 'L' } };
export const RightCurve = { args: { letter: 'R' } };
export const InsideCurve = { args: { letter: 'I' } };
export const OutsideCurve = { args: { letter: 'O' } };
export const Cross = { args: { letter: 'X' } };

/** Sitting in a paragraph, where the line spacing must not change. */
export const InAParagraph = { render: () => ({ Component: PieceTagParagraph }) };
