// The title's letters, each built from Rail Cube track and saved square on from the
// Snapshot story at 120 px a cube. Every measurement here is in cubes, so one scale
// applied to all of them keeps every cube the same size on screen.

/** Pixels a cube in the PNGs: `perCube` 60 at pixel ratio 2. */
export const PER_CUBE_PX = 120;

/** Every letter is this many cubes tall. */
export const HEIGHT = 8;

/** Each letter's width, in cubes. */
export const WIDTHS = {
  A: 4, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4, I: 1, J: 4, K: 4, L: 4,
  M: 7, N: 4, O: 4, P: 4, R: 4, S: 4, T: 5, U: 4, W: 7, X: 4, Y: 4, Z: 4,
};

/** Gaps between letters, between words and between rows, in cubes. */
export const GAPS = { letter: 0.5, word: 2, row: 1 };

/** A word's width in cubes, letter gaps included. */
export function wordWidth(word) {
  const letters = [...word];
  return letters.reduce((sum, l) => sum + WIDTHS[l], 0) + GAPS.letter * (letters.length - 1);
}

/** A row of words' width in cubes, word gaps included. */
export function rowWidth(words) {
  return words.reduce((sum, w) => sum + wordWidth(w), 0) + GAPS.word * (words.length - 1);
}

/** The height of `rows` rows of letters in cubes, row gaps included. */
export function rowsHeight(rows) {
  return HEIGHT * rows + GAPS.row * (rows - 1);
}

/**
 * The O is the post's first track, and this is how it was snapped: the shape, and
 * the face of its box it was looked at square on from, unturned (see `squareOn` in
 * scenes.js). The title zooms out of it into the post.
 */
export const O_TRACK = { shape: 'SIOSLLSOISLL', view: 'above', turn: 0 };
