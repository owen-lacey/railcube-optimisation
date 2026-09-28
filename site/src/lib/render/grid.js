// The cell lattice the model works in, drawn as a wireframe.
//
// One cell is one straight cube, and a cell `c` spans `toWorld(c) ± CUBE/2`, so
// the lattice's planes sit half a cell either side of every cell in the box.
//
// PolyCSS has no line primitive and every polygon is single-sided, so each line
// is a thin square prism: four side faces, each wound outward, which between them
// face every way the camera can look from. One prism per full-length line rather
// than one per cell edge keeps the polygon count to the lines actually visible.

import { CUBE, GRID_W } from './dimensions.js';
import { toWorld, windToward } from './vec.js';

const HALF = GRID_W / 2 / CUBE; // half the line's thickness, in cells

/** The boundary planes of a box of cells, along one axis, in cell units. */
const planes = (lo, hi) => Array.from({ length: hi - lo + 2 }, (_, i) => lo - 0.5 + i);

/** A project-frame unit vector along one axis. */
const along = (axis, sign = 1) => [0, 1, 2].map(k => (k === axis ? sign : 0));

/**
 * One line of the lattice: a prism running along `axis` from `from` to `to`, its
 * centre line at `at` in the other two axes. Everything is built in project cell
 * units and only then sent through `toWorld`, so the axis mapping lives in one place.
 */
function line(axis, from, to, at) {
  const [u, v] = [0, 1, 2].filter(k => k !== axis);
  const point = (a, du, dv) => {
    const p = [0, 0, 0];
    p[axis] = a;
    p[u] = at[u] + du;
    p[v] = at[v] + dv;
    return toWorld(p);
  };
  const faces = [
    [u, 1, [[HALF, -HALF], [HALF, HALF]]],
    [u, -1, [[-HALF, -HALF], [-HALF, HALF]]],
    [v, 1, [[-HALF, HALF], [HALF, HALF]]],
    [v, -1, [[-HALF, -HALF], [HALF, -HALF]]],
  ];
  // No colour: the lattice is painted by the viewer's stylesheet, not by PolyCSS.
  return faces.map(([normal, sign, [[du0, dv0], [du1, dv1]]]) => ({
    vertices: windToward([
      point(from, du0, dv0), point(to, du0, dv0), point(to, du1, dv1), point(from, du1, dv1),
    ], toWorld(along(normal, sign))),
  }));
}

/**
 * Every line of the lattice around a box of cells, `{ lo, hi }` inclusive, as
 * polygons in world units: `(ny+1)(nz+1) + (nx+1)(nz+1) + (nx+1)(ny+1)` lines of
 * four faces each.
 */
export function gridLines({ lo, hi }) {
  const cuts = [0, 1, 2].map(a => planes(lo[a], hi[a]));
  return [0, 1, 2].flatMap(axis => {
    const [u, v] = [0, 1, 2].filter(k => k !== axis);
    const ends = [cuts[axis][0], cuts[axis].at(-1)];
    return cuts[u].flatMap(pu => cuts[v].flatMap(pv => {
      const at = [0, 0, 0];
      at[u] = pu;
      at[v] = pv;
      return line(axis, ...ends, at);
    }));
  });
}
