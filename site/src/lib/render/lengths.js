// The lattice box's three side lengths, as labels beside its edges.
//
// Like the axis letters, a length is HTML over the canvas rather than geometry, so
// it reads the right way round from anywhere. Each axis has four edges running
// along it; the label goes on one that stays on the outside of the box: for the
// two flat sides the edge lowest on screen, for the upright the leftmost. Which
// edge that is depends on the camera, so it is chosen afresh on every placement.

import { LENGTH_GAP } from './dimensions.js';
import { toWorld } from './vec.js';

/** The middles of the four edges running along `axis`, in cell units. */
function edgeMiddles({ lo, hi }, axis) {
  const [u, v] = [0, 1, 2].filter(a => a !== axis);
  const side = (a, high) => (high ? hi[a] + 0.5 : lo[a] - 0.5);
  return [[false, false], [false, true], [true, false], [true, true]].map(([hu, hv]) => {
    const p = [];
    p[axis] = (lo[axis] + hi[axis]) / 2;
    p[u] = side(u, hu);
    p[v] = side(v, hv);
    return p;
  });
}

/** Which of an axis's projected edge middles to label: lowest for the flat sides, leftmost for up. */
const PICK = [
  (a, b) => b.y - a.y,
  (a, b) => a.x - b.x,
  (a, b) => b.y - a.y,
];

/**
 * One label per side of a box of cells, `{ lo, hi }` inclusive: `{ axis, text, x, y }`,
 * where `text` is the side's length in cells and `x, y` is where the label goes in
 * whatever pixels `project` maps world points to (`project` in stage.js).
 */
export function edgeLengths(box, project) {
  const [centre] = project([toWorld(box.lo.map((lo, a) => (lo + box.hi[a]) / 2))]);
  return [0, 1, 2].map(axis => {
    const spots = project(edgeMiddles(box, axis).map(toWorld));
    const spot = [...spots].sort(PICK[axis])[0];
    const out = Math.hypot(spot.x - centre.x, spot.y - centre.y) || 1;
    return {
      axis,
      text: String(box.hi[axis] - box.lo[axis] + 1),
      x: spot.x + (spot.x - centre.x) / out * LENGTH_GAP,
      y: spot.y + (spot.y - centre.y) / out * LENGTH_GAP,
    };
  });
}
