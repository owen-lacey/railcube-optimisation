// The cell lattice the model works in, drawn as a wireframe.
//
// One cell is one straight cube, and a cell `c` spans `toWorld(c) ± CUBE/2`, so
// the lattice's planes sit half a cell either side of every cell in the box.
//
// Every polygon is single-sided, so each line is a thin square prism rather than a
// GL line (which would be one pixel wide at any zoom): four side faces, each wound
// outward, which between them face every way the camera can look from.
//
// The paint is see-through, so wherever two prisms overlapped they would be drawn
// twice and come out darker, and wherever none reaches there is a hole. Running
// each line the full length of the box did both at once: three lines meeting at a
// corner overlapped along their centres and left the corner's outer part empty. So
// the lattice is drawn as the solid it is — one prism per cell edge, stopping half
// a line short of each end, and a cube at every node where lines meet — with only
// its outside surface: a node's cube has a face on a side only where no line leaves
// it, which happens only on the box's own faces.

import { CUBE, GRID_W } from './dimensions.js';
import { toWorld, windToward } from './vec.js';

const HALF = GRID_W / 2 / CUBE; // half the line's thickness, in cells

/** The boundary planes of a box of cells, along one axis, in cell units. */
const planes = (lo, hi) => Array.from({ length: hi - lo + 2 }, (_, i) => lo - 0.5 + i);

/** A project-frame unit vector along one axis. */
const along = (axis, sign = 1) => [0, 1, 2].map(k => (k === axis ? sign : 0));

/** The two axes other than `axis`. */
const others = axis => [0, 1, 2].filter(k => k !== axis);

/**
 * A square of side `2h` about `centre` (cell units), lying across `axis` at
 * `sign * h` from the centre and wound to face that way, in world units.
 */
function square(centre, axis, sign, h) {
  const [u, v] = others(axis);
  const corner = (du, dv) => {
    const p = [...centre];
    p[axis] += sign * h;
    p[u] += du * h;
    p[v] += dv * h;
    return toWorld(p);
  };
  return {
    vertices: windToward([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
      toWorld(along(axis, sign))),
  };
}

/**
 * One edge of the lattice: a prism running along `axis` from `from` to `to`, its
 * centre line at `at` in the other two axes. Everything is built in project cell
 * units and only then sent through `toWorld`, so the axis mapping lives in one place.
 */
function line(axis, from, to, at, half) {
  const [u, v] = others(axis);
  const point = (a, du, dv) => {
    const p = [0, 0, 0];
    p[axis] = a;
    p[u] = at[u] + du;
    p[v] = at[v] + dv;
    return toWorld(p);
  };
  const faces = [
    [u, 1, [[half, -half], [half, half]]],
    [u, -1, [[-half, -half], [-half, half]]],
    [v, 1, [[-half, half], [half, half]]],
    [v, -1, [[-half, -half], [half, -half]]],
  ];
  // No colour: the lattice is painted flat by the stage's overlay material.
  return faces.map(([normal, sign, [[du0, dv0], [du1, dv1]]]) => ({
    vertices: windToward([
      point(from, du0, dv0), point(to, du0, dv0), point(to, du1, dv1), point(from, du1, dv1),
    ], toWorld(along(normal, sign))),
  }));
}

/** Every point on all three lists of planes. */
const nodes = cuts => cuts[0].flatMap(a => cuts[1].flatMap(b => cuts[2].map(c => [a, b, c])));

/** The prisms between neighbouring nodes, each stopping `half` short of both. */
function edges(cuts, half) {
  return [0, 1, 2].flatMap(axis => nodes(cuts)
    .filter(at => at[axis] !== cuts[axis].at(-1))
    .flatMap(at => {
      const next = cuts[axis][cuts[axis].indexOf(at[axis]) + 1];
      return line(axis, at[axis] + half, next - half, at, half);
    }));
}

/** The faces of each node's cube that no edge leaves from: the box's outside. */
function joints(cuts, half) {
  return nodes(cuts).flatMap(at => [0, 1, 2].flatMap(axis => [1, -1]
    .filter(sign => at[axis] === (sign > 0 ? cuts[axis].at(-1) : cuts[axis][0]))
    .map(sign => square(at, axis, sign, half))));
}

/** The lattice on these planes (cell units, ascending per axis), lines `half` cells thick each side. */
const lattice = (cuts, half) => [...edges(cuts, half), ...joints(cuts, half)];

/**
 * Every line of the lattice around a box of cells, `{ lo, hi }` inclusive, as
 * polygons in world units: four faces per cell edge, plus a face at each node for
 * every side of the box it lies on.
 */
export function gridLines({ lo, hi }) {
  return lattice([0, 1, 2].map(a => planes(lo[a], hi[a])), HALF);
}

/**
 * The twelve edges of the cell centred on `[0, 0, 0]`, as prisms `width` thick
 * (world units) — the lattice's own lines, only bolder, for picking one cell out.
 */
export function cellEdges(width) {
  return lattice([0, 1, 2].map(() => [-0.5, 0.5]), width / 2 / CUBE);
}

/**
 * One cell as a solid box about the origin, `inset` units inside the cell's own
 * faces on every side. Six faces, each wound outward, so from outside only the
 * three nearest are drawn and a see-through fill is never doubled.
 *
 * The inset is what keeps it off the track: a train cell's floor is exactly the
 * face of the cube below it, and two coplanar faces flicker between each other.
 */
export function cellBox(inset) {
  const h = 0.5 - inset / CUBE;   // half the box, in cells
  return [0, 1, 2].flatMap(axis => [1, -1].map(sign => square([0, 0, 0], axis, sign, h)));
}

/**
 * One face of the cell centred on `[0, 0, 0]` — the one on the `dir` side, a
 * project-frame unit vector — `inset` units inside the cell like `cellBox`. Wound
 * both ways, so it shows from either side; it is a patch of paint, not a solid.
 */
export function cellFace(dir, inset) {
  const axis = dir.findIndex(v => v !== 0);
  const { vertices } = square([0, 0, 0], axis, dir[axis], 0.5 - inset / CUBE);
  return [{ vertices }, { vertices: [...vertices].reverse() }];
}
