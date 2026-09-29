// What each piece does to the train, one tab per piece, and nothing moving.

import PieceMoves from './PieceMoves.svelte';
import { PIECES } from '$lib/catalogue.js';

export default {
  title: 'Piece moves',
  component: PieceMoves,
  argTypes: {
    initial: { control: 'select', options: PIECES.map(p => p.type) },
  },
};

export const Default = {};

/** Opened on the outside curve, whose after-train hangs off the front face. */
export const OutsideCurve = { args: { initial: 'outsideCurve' } };
