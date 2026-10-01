// Words in prose in one of the page's known colours. Only tokens are accepted.

import HighlightParagraph from './HighlightParagraph.svelte';
import { COLOUR_TOKENS } from '$lib/colours.js';

export default {
  title: 'Highlight',
  component: HighlightParagraph,
  argTypes: {
    colour: { control: 'select', options: COLOUR_TOKENS },
  },
};

/** The origin cell's blue, which is the lattice's — the post's first use. */
export const OriginCube = { args: { colour: 'grid-color' } };

/** A piece's own colour. */
export const LeftCurve = { args: { colour: 'leftCurve' } };
