// The one seeded generator, shared by the site and the scripts, so it imports
// nothing: a draw that must be reproducible is a function of its seed.

/** mulberry32: a small seeded PRNG, uniform on [0, 1). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
