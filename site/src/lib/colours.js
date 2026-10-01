// The colours prose is allowed to be written in, by name. A name is either one of
// the stylesheet's colour properties (site/src/app.css), which stays in CSS, or a
// piece type, whose colour is the one its cubes are drawn in. Nothing else is a
// colour here — a hex code or a CSS colour name is refused, so prose can only ever
// match something a viewer actually draws.

import { COLORS } from './render/dimensions.js';

/** The colour properties on `:root` in app.css, without their dashes. */
const THEME = ['grid-color', 'ghost-before', 'ghost-after', 'card-border', 'card-footer'];

/** Every name `colourOf` accepts. */
export const COLOUR_TOKENS = [...THEME, ...Object.keys(COLORS)];

/** The CSS value for a colour token; throws on anything that is not one. */
export function colourOf(token) {
  if (THEME.includes(token)) return `var(--${token})`;
  if (Object.hasOwn(COLORS, token)) return COLORS[token];
  throw new Error(`Unknown colour token "${token}"`);
}
