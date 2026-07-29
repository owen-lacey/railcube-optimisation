// Inventories the tests solve against. Fixtures, not model data.
//
// The model holds exactly one set — `SET` in src/track.js — and these are not it.
// They exist because a test has to be exhaustive in seconds: an oracle-agreement
// sweep needs a pool small enough to enumerate, a collision test needs a pool
// deep enough that inventory never bites, and the crossing tests need crosses,
// which the model's set has none of.
//
// The two named after products mirror the counts documented, with sources, in
// docs/pieces.md. They are kept here rather than exported from track.js because
// nothing in the model needs them: asserting a fixture against itself would prove
// nothing, so no test claims these numbers are right — docs/pieces.md cites them.

/** The published starter set: 32 track cubes. */
export const STARTER = {
  straight: 16, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0,
};

/** The published deluxe set: 66 track cubes, and the only product with crosses. */
export const DELUXE = {
  straight: 32, leftCurve: 8, rightCurve: 8, insideCurve: 8, outsideCurve: 8, cross: 2,
};

/**
 * A bottomless box, for tests about geometry where an inventory limit would
 * quietly change the question. Not `Infinity`: the enumerator counts against
 * these, so they have to be numbers.
 */
export const UNLIMITED = {
  straight: 99, leftCurve: 99, rightCurve: 99, insideCurve: 99, outsideCurve: 99, cross: 0,
};
