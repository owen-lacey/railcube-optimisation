// One story per piece type, named and described in the reader's vocabulary —
// the copy comes from the same catalogue the blog post will quote.

import PieceViewer from './PieceViewer.svelte';
import { PIECES } from '$lib/catalogue.js';

export default {
  title: 'Pieces',
  component: PieceViewer,
  argTypes: {
    type: { table: { disable: true } },
    poses: { table: { disable: true } },
  },
};

const story = type => {
  const piece = PIECES.find(p => p.type === type);
  return {
    args: { type },
    parameters: {
      docs: {
        description: {
          story: `Letter **${piece.letter}**, ${piece.colour}. ${piece.effect} ${piece.detail}`,
        },
      },
    },
  };
};

export const Straight = story('straight');
export const LeftCurve = story('leftCurve');
export const RightCurve = story('rightCurve');
export const InsideCurve = story('insideCurve');
export const OutsideCurve = story('outsideCurve');
export const Cross = story('cross');
