// The axes the post's coordinates are written in, drawn as three labelled arrows.
//
// The reader's frame is x = forwards, y = left, z = up (docs/coordinates.md). The
// model's own is [right, up, forwards], so everything here is built in the reader's
// frame and sent through `toWorld` at the last moment, as [−y, z, x] — the one place
// the two frames meet in the renderer.
//
// The origin cell is outlined where it is. The arrows are not at it: the start cube
// fills the cell and the track winds round it, so arrows there are lost in the
// cubes. They stand at the lattice box's outer corner instead, clear of the track.
// Everything is one colour, painted flat by the
// stage. The letters are not drawn here: a glyph made of geometry turns with the
// camera and reads backwards from behind. They are HTML, placed by the viewer from
// `LABEL_SPOTS` — see `originTips` in stage.js.
//
// Like the lattice, every shape is closed — a bar is four sides and two caps, a
// head is four sides and a base — because faces are single-sided and the camera
// can be anywhere.

import { CUBE, AXIS_W, AXIS_LENGTH, AXIS_HEAD, AXIS_HEAD_W, AXIS_LABEL, AXIS_GAP, ORIGIN_W } from './dimensions.js';
import { cellEdges } from './grid.js';
import { toWorld, cross, add, sub, unit, windToward } from './vec.js';

/** A point in the reader's frame (x forwards, y left, z up), in cells, as world units. */
const at = ([x, y, z]) => toWorld([-y, z, x]);

const scale = (v, s) => v.map(c => c * s);

/** Two unit vectors perpendicular to `d` and to each other. */
function crossSection(d) {
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unit(cross(d, ref));
  return [u, cross(d, u)];
}

/** The four corners of a square around `centre`, `w` from it, in winding order. */
function ring(centre, [u, v], w) {
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) =>
    add(centre, add(scale(u, a * w), scale(v, b * w))));
}

/** A thin closed prism from `a` to `b` (world units), `w` either side of its axis. */
function bar(a, b, w) {
  const d = unit(sub(b, a));
  const start = ring(a, crossSection(d), w);
  const end = ring(b, crossSection(d), w);
  const sides = start.map((_, k) => {
    const j = (k + 1) % 4;
    const out = add(sub(start[k], a), sub(start[j], a));
    return { vertices: windToward([start[k], end[k], end[j], start[j]], out) };
  });
  return [
    ...sides,
    { vertices: windToward(start, scale(d, -1)) },
    { vertices: windToward(end, d) },
  ];
}

/**
 * A four-sided head whose base is centred on `base`, narrowing along `d` to a tip a
 * pinhead wide. Every face is a quad, like the lattice's (PolyCSS drew a triangle
 * as a sliver that could show its unpainted underside).
 */
function head(base, d, length, w) {
  const frame = crossSection(d);
  const corners = ring(base, frame, w);
  const tip = ring(add(base, scale(d, length)), frame, w * TIP);
  const sides = corners.map((c, k) => {
    const j = (k + 1) % 4;
    const out = add(add(sub(c, base), sub(corners[j], base)), scale(d, w / length));
    return { vertices: windToward([c, corners[j], tip[j], tip[k]], out) };
  });
  return [
    ...sides,
    { vertices: windToward(corners, scale(d, -1)) },
    { vertices: windToward(tip, d) },
  ];
}

const TIP = 0.05;   // the tip's width as a fraction of the base's

const AXES = [['x', 0], ['y', 1], ['z', 2]];

/**
 * Where each axis's label sits, in world units from the arrows' corner: just past the
 * tip. `size` scales the arrows, 1 being the post's usual.
 */
export const labelSpots = (size = 1) => AXES.map(([name, k]) => {
  const spot = [0, 0, 0];
  spot[k] = (AXIS_LENGTH + AXIS_LABEL) * size;
  return { name, position: at(spot) };
});

/**
 * The lattice box's corners the arrows can stand at, as model cells `gap` outside
 * them. 'near' is the corner nearest the camera from the default angle (reader's
 * low x, y and z), stood off on all three axes, so the arrows hang below the box on
 * screen. 'left' is the box's left-hand corner on screen (reader's low x, high y and
 * low z), stood off along x and y alike, which is straight left on screen, so the arrows
 * stand beside the box at its floor. The x arrow points right, back towards the box,
 * so the gap must carry its label clear of the box's left edge.
 */
const CORNERS = {
  near: ({ lo, hi }, gap) => [hi[0] + 0.5 + gap, lo[1] - 0.5 - gap, lo[2] - 0.5 - gap],
  left: ({ lo }, gap) => [lo[0] - 0.5 - gap, lo[1] - 0.5, lo[2] - 0.5 - gap],
};

/**
 * Where the arrows' corner goes, in world units: `gap` cells (`AXIS_GAP` unless given)
 * outside one of the lattice box's `CORNERS` ('near' unless given), so the arrows run
 * alongside the box and never through the track. `lo` and `hi` are in the model's frame.
 */
export function axisAnchor({ lo, hi, gap = AXIS_GAP, corner = 'near' }) {
  if (!(corner in CORNERS)) throw new Error(`no axis corner '${corner}'`);
  return toWorld(CORNERS[corner]({ lo, hi }, gap));
}

/** The origin cell's outline, in world units about the cell whose centre is `[0, 0, 0]`. */
export const originCell = () => cellEdges(ORIGIN_W);

/**
 * The three arrows, in world units, leaving `[0, 0, 0]` along the reader's x, y and z,
 * every dimension scaled by `size`.
 */
// The shaft runs on into the head rather than stopping at its base: a shaft's end
// cap and the head's base would otherwise be coplanar and face opposite ways, and
// that pair is what showed white.
export function axisArrows(size = 1) {
  return AXES.flatMap(([, k]) => {
    const dir = [0, 0, 0];
    dir[k] = 1;
    const tip = scale(dir, AXIS_LENGTH * size);
    const headBase = sub(tip, scale(dir, AXIS_HEAD * size));
    const d = unit(at(dir));
    return [
      ...bar(at([0, 0, 0]), at(add(headBase, scale(dir, (AXIS_HEAD * size) / 2))), (AXIS_W * size) / 2),
      ...head(at(headBase), d, AXIS_HEAD * size * CUBE, AXIS_HEAD_W * size * CUBE),
    ];
  });
}
