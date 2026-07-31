// The train.
//
// A body riding above the track on two pairs of wheels — only the wheels drop
// into the channel. Authored with its origin at the point where the wheels meet
// the rail, facing forwards, so it can be dropped straight onto a rail sample.

import {
  TRAIN_W, TRAIN_L, TRAIN_H, NOSE_L, TRAIN_BEVEL, BODY_Z,
  WHEEL_W, WHEEL_L, WHEEL_H, WHEEL_INSET,
  TRAIN_COLOR, WINDOW_COLOR, WHEEL_COLOR,
} from './dimensions.js';
import { oriented, translate, add, sub, unit, cross } from './vec.js';
import { chamferedBox } from './pieces.js';

// The shell is a loft, not a box: a chamfered cross-section placed at each
// station along the length and stitched to its neighbour. `w` and `h` are
// fractions of the full half-width and roof height, the latter measured from
// the body's own centre. The underside stays flat the whole way, so both wheel
// pairs still meet the rail; only the width and the roofline pinch in, over the
// last NOSE_L, and that is what makes the nose read as pointed.
const STATIONS = [
  { y: -TRAIN_L / 2,         w: 1,    h: 1    },
  { y: TRAIN_L / 2 - NOSE_L, w: 1,    h: 1    },
  { y: TRAIN_L / 2 - 3,      w: 0.84, h: 0.92 },
  { y: TRAIN_L / 2 - 1.2,    w: 0.62, h: 0.66 },
  { y: TRAIN_L / 2,          w: 0.35, h: 0.30 },
].map(({ y, w, h }) => ({ y, hw: w * TRAIN_W / 2, top: h * TRAIN_H / 2 }));

const lerpStation = (a, b, t) => ({
  y: a.y + (b.y - a.y) * t,
  hw: a.hw + (b.hw - a.hw) * t,
  top: a.top + (b.top - a.top) * t,
});

// The cross-section anywhere along the body, so glass can be placed by the
// length it sits at rather than by station index.
const sectionAt = y => {
  const j = Math.min(STATIONS.findLastIndex(st => st.y <= y), STATIONS.length - 2);
  const [a, b] = [STATIONS[j], STATIONS[j + 1]];
  return lerpStation(a, b, (y - a.y) / (b.y - a.y));
};

// One cross-section as (x, z) points round the hull: a flat-bottomed chamfered
// rectangle, walked from the roof round to the left side.
const section = ({ hw, top }) => {
  const b = TRAIN_BEVEL, zb = -TRAIN_H / 2;
  return [
    [-hw + b, top], [hw - b, top], [hw, top - b], [hw, zb + b],
    [hw - b, zb], [-hw + b, zb], [-hw, zb + b], [-hw, top - b],
  ];
};

// Stitch neighbouring sections into the shell and cap both ends. `oriented` is
// safe throughout: however far the nose tapers, the shell stays convex and
// still holds its own origin.
function shell(color) {
  const polys = [];
  const push = vs => polys.push({ vertices: oriented(vs), color });
  STATIONS.forEach((st, j) => {
    const last = j === STATIONS.length - 1;
    if (j === 0 || last) push(section(st).map(([x, z]) => [x, st.y, z]));
    if (last) return;
    const next = STATIONS[j + 1], [s0, s1] = [section(st), section(next)];
    s0.forEach((p, k) => {
      const k1 = (k + 1) % s0.length;
      push([[p[0], st.y, p[1]], [s0[k1][0], st.y, s0[k1][1]],
        [s1[k1][0], next.y, s1[k1][1]], [s1[k][0], next.y, s1[k][1]]]);
    });
  });
  return polys;
}

// Glass: patches of the shell repeated in a darker colour and lifted clear
// along their own normal, so they read as windows set into the bodywork instead
// of z-fighting it. Every patch must sit inside a single shell facet — one
// straddling a station would not lie flush.
const GLASS_LIFT = 0.08;
const GLASS_MARGIN = 0.4;          // bodywork left showing either side of the windscreen
const GLASS_DROP = 0.6;            // bodywork left showing under the roofline
const GLASS_DEPTH = 2.8;           // how deep the side glass runs
const SIDE_GLASS = [[-5.8, -3], [-2.4, 0.4], [2.2, 3.7]]; // spans along the body
// The height band the side glass fills, taken from the full roof height rather
// than each station's own, so a panel spanning the taper stays planar and flush.
const GLASS_TOP = TRAIN_H / 2 - TRAIN_BEVEL - GLASS_DROP;
const SIDE_GLASS_Z = [GLASS_TOP - GLASS_DEPTH, GLASS_TOP];
const SCREEN = [3, 6.6];           // the windscreen's span, wrapping over the nose

const glassPanel = vs => {
  const o = oriented(vs);
  const n = unit(cross(sub(o[1], o[0]), sub(o[2], o[0])));
  return { vertices: o.map(v => add(v, n.map(c => c * GLASS_LIFT))), color: WINDOW_COLOR };
};

function glass() {
  const [z0, z1] = SIDE_GLASS_Z;
  const sides = SIDE_GLASS.flatMap(([y0, y1]) => {
    const [a, b] = [sectionAt(y0), sectionAt(y1)];
    return [-1, 1].map(s => glassPanel(
      [[s * a.hw, a.y, z0], [s * a.hw, a.y, z1], [s * b.hw, b.y, z1], [s * b.hw, b.y, z0]]));
  });
  // The windscreen bends with the nose rather than cutting through it: it is
  // split at every station it crosses, so each piece lies in one roof facet.
  const bends = STATIONS.map(st => st.y).filter(y => y > SCREEN[0] && y < SCREEN[1]);
  const across = [SCREEN[0], ...bends, SCREEN[1]].map(sectionAt);
  const x = st => st.hw - TRAIN_BEVEL - GLASS_MARGIN;
  const screen = across.slice(0, -1).map((a, k) => {
    const b = across[k + 1];
    return glassPanel([[-x(a), a.y, a.top], [x(a), a.y, a.top],
      [x(b), b.y, b.top], [-x(b), b.y, b.top]]);
  });
  return [...sides, ...screen];
}

/** The whole loco as one polygon soup, in its own frame. */
export function trainBody() {
  return [
    ...translate([...shell(TRAIN_COLOR), ...glass()], [0, 0, BODY_Z + TRAIN_H / 2]),
    ...[-WHEEL_INSET, WHEEL_INSET].flatMap(y =>
      translate(chamferedBox([WHEEL_W, WHEEL_L, WHEEL_H], 0.6, WHEEL_COLOR),
        [0, y, 0.05 + WHEEL_H / 2])), // a hair above the strip, so the two never z-fight
  ];
}
