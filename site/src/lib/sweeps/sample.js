// What a sweep's layouts are measured and picked by, whichever sweep they are from.

/** How many cells a layout fills, across, up and along. Its `span` multiplied out. */
export const volumeOf = ({ span }) => span[0] * span[1] * span[2];

/**
 * A sample of `count` of `layouts`, the same one every time for a given `seed`.
 *
 * A figure showing twelve of a thousand layouts has to show the same twelve on
 * every render, or the post changes under the reader between a screenshot and a
 * scroll — and a plain `slice` would show twelve neighbours in sort order, which
 * are alphabetical neighbours and so all start alike. This spreads the pick over
 * the whole list without needing the list shuffled.
 */
export function sample(count, seed, layouts) {
  if (count > layouts.length) throw new Error(`only ${layouts.length} layouts to pick from`);

  // A full-cycle stride: any step coprime with the length visits every entry
  // before repeating, so the pick never collides with itself and never has to
  // check whether it has.
  let stride = Math.floor(layouts.length / (count + 1)) || 1;
  while (gcd(stride, layouts.length) !== 1) stride += 1;

  const start = Math.abs(seed) % layouts.length;
  return Array.from({ length: count },
    (_, i) => layouts[(start + i * stride) % layouts.length]);
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
