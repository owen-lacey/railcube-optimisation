// Where the rail runs through each piece.
//
// railMap(u, w, s) is the point `u` to the right of the rail and `w` above it,
// `s` of the way through the piece (0 at the entry mouth, 1 at the exit), in
// the piece's canonical UF frame. The curves reuse the very sweep maps their
// geometry is built from, so the train cannot drift off the metal strip.

import { MOVES, poseLetters, delta } from '../../../../src/track.js';
import { CUBE, RAIL, CHANNEL_D } from './dimensions.js';
import { ARC_MAP, EDGE_R, OUT_C } from './pieces.js';
import { DIR, add, sub, len, unit, cross, through, toWorld, poseRotation } from './vec.js';

const OUT_RF = EDGE_R - CHANNEL_D;                  // rail radius round the rounded edge
const OUT_LEGS = [CUBE / 2 + OUT_C, OUT_RF * Math.PI / 2]; // flat top run, then the arc
const OUT_LEN = 2 * OUT_LEGS[0] + OUT_LEGS[1];      // the front run is the same as the top

export const RAIL_MAPS = {
  straight: (u, w, s) => [u, -CUBE / 2 + s * CUBE, RAIL + w],
  cross: (u, w, s) => [u, -CUBE / 2 + s * CUBE, RAIL + w],
  leftCurve: (u, w, s) => ARC_MAP.leftCurve(u, RAIL + w, s * Math.PI / 2),
  // The right curve is the left one mirrored, so mirror the rail with it.
  rightCurve: (u, w, s) => {
    const [x, y, z] = ARC_MAP.leftCurve(-u, RAIL + w, s * Math.PI / 2);
    return [-x, y, z];
  },
  insideCurve: (u, w, s) => ARC_MAP.insideCurve(u, RAIL + w, s * Math.PI / 2),
  // Three legs measured by distance travelled: across the top, over the
  // rounded edge, then down the front face.
  outsideCurve: (u, w, s) => {
    const [flat, arc] = OUT_LEGS, d = s * OUT_LEN;
    if (d <= flat) return [u, -CUBE / 2 + d, RAIL + w];
    if (d <= flat + arc) {
      const t = (d - flat) / OUT_RF;
      return [u, OUT_C + (OUT_RF + w) * Math.sin(t), OUT_C + (OUT_RF + w) * Math.cos(t)];
    }
    return [u, RAIL + w, OUT_C - (d - flat - arc)];
  },
};

// Where the train sits, and which way it faces, part-way through a piece: the
// heading comes from stepping along the rail, the up direction from stepping
// away from it. The step straddles s even at the mouths — every rail map keeps
// going past its own ends, and a one-sided step would read a curve's chord
// instead of its tangent, kinking the train at each join.
export function railFrame(type, s) {
  const map = RAIL_MAPS[type];
  if (!map) throw new Error(`no rail path for piece type ${type}`);
  const e = 1e-3;
  const pos = map(0, 0, s);
  return {
    pos,
    fwd: unit(sub(map(0, 0, s + e), map(0, 0, s - e))),
    up: unit(sub(map(0, 1, s), pos)),
  };
}

// Every piece's rail must run from the centre of its entry mouth to the centre
// of the next piece's, arriving with the face and heading the piece's exit pose
// promises — otherwise a train would jump or twist at the join. Checked against
// the displacement table in MOVES, so the two can never drift apart.
export function assertRailMouths() {
  const MOUTH = [0, -CUBE / 2, RAIL];
  for (const [type, move] of Object.entries(MOVES)) {
    const exit = poseRotation(move.exit);
    const want = {
      pos: add(toWorld(delta(poseLetters('UF'), move.disp)), through(exit, MOUTH)),
      fwd: DIR[move.exit[1]],
      up: DIR[move.exit[0]],
    };
    const ends = { 0: { pos: MOUTH, fwd: DIR.F, up: DIR.U }, 1: want };
    for (const [s, expected] of Object.entries(ends)) {
      const got = railFrame(type, Number(s));
      for (const k of ['pos', 'fwd', 'up']) {
        if (len(sub(got[k], expected[k])) > 1e-6) {
          throw new Error(`${type} rail ${k} at s=${s}: got ${got[k]}, wanted ${expected[k]}`);
        }
      }
    }
  }
}

// Run at module load, exactly as it ran at page load in the spike. It is a
// correctness assertion about the geometry, not a debug aid: if a rail no
// longer meets its mouth, nothing downstream will notice, but every join in
// every layout will be subtly wrong.
assertRailMouths();

// Walk a chained route and sample the whole rail as one polyline in scene
// space. Each piece contributes `samples` points from its entry mouth up to
// (not including) its exit, where the next piece takes over — so on a closed
// loop the polyline closes too.
export function trackPath(placed, samples = 24) {
  return placed.flatMap(({ cell, type, pose }) => {
    const basis = poseRotation(pose), origin = toWorld(cell);
    return Array.from({ length: samples }, (_, k) => {
      const { pos, fwd, up } = railFrame(type, k / samples);
      return {
        pos: add(through(basis, pos), origin),
        fwd: through(basis, fwd),
        up: through(basis, up),
      };
    });
  });
}

// Where a train stands to be looked at rather than driven: on a `type` piece at
// `cell` and `pose`, half a cube along its rail from the entry — the middle of a
// straight, and still inside the first cube of a curve — lying along the rail
// there the way the driver lays it. The basis is the driver's, `[right, fwd, up]`.
export function trainAt(type, cell, pose) {
  const { pos, fwd, up } = railFrame(type, alongRail(type, CUBE / 2));
  const turn = poseRotation(pose);
  const [f, u] = [fwd, up].map(v => through(turn, v));
  return { basis: [cross(f, u), f, u], position: add(toWorld(cell), through(turn, pos)) };
}

// How far through a piece (0..1) the rail has run `distance` from its entry,
// measured along the rail itself rather than by the parameter, which runs at
// different rates on different pieces.
function alongRail(type, distance, samples = 240) {
  let run = 0;
  let last = RAIL_MAPS[type](0, 0, 0);
  for (let k = 1; k <= samples; k++) {
    const next = RAIL_MAPS[type](0, 0, k / samples);
    const gap = len(sub(next, last));
    if (run + gap >= distance) return (k - 1 + (distance - run) / gap) / samples;
    run += gap;
    last = next;
  }
  throw new Error(`the ${type} rail is shorter than ${distance}`);
}
