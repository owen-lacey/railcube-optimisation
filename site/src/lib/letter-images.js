// The title's letters as the page loads them: WebP, downscaled from the masters at
// build time by vite-imagetools, so a redone master is never shown stale.
//
// The masters are 120 px a cube (`PER_CUBE_PX`), for the Snapshot story to write
// and to redo letters from; the page never draws a cube bigger than about 16 CSS
// px (56rem over the 55.5 cubes of the top row), so it is offered each letter at
// `WEB_PER_CUBE_PX` a cube, times 1, 2 and 3, one for each pixel ratio. The query
// is a literal because Vite reads it before anything runs: its heights are
// `HEIGHT` cubes at each of those, and tests/letters.test.js holds them to it.

/** @type {Record<string, { src: string, width: number, height: number, format: string }[]>} */
const SIZES = import.meta.glob('./assets/letters/*.png', {
  eager: true,
  query: { h: '136;272;408', format: 'webp', as: 'metadata' },
  import: 'default',
});

/**
 * Each letter's downscaled pictures, smallest first, `{ src, width, height, format }`
 * each — the 1×, 2× and 3× of its `srcset`.
 */
export const LETTER_IMAGES = Object.fromEntries(Object.entries(SIZES).map(([path, sizes]) => [
  path.match(/([A-Z])\.png$/)[1],
  [...sizes].sort((a, b) => a.height - b.height).map(({ src, width, height, format }) => ({ src, width, height, format })),
]));

/** A letter's `src` (its 1×) and `srcset`, by pixel ratio. */
export function letterImage(letter) {
  const sizes = LETTER_IMAGES[letter];
  return { src: sizes[0].src, srcset: sizes.map(({ src }, i) => `${src} ${i + 1}x`).join(', ') };
}
