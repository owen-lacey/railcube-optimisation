// The piece geometry: one generator per piece type, all authored in the
// canonical DF pose (train on the down face of its cell, so rail on the cube's top
// face, heading forwards).
//
// Everything is generated as Polygon[] chamfered cuboids (6 inset faces + 12
// bevel strips + 8 corner triangles). PolyCSS shades each polygon by its
// normal, so the bevels read as moulded plastic edges. Building cuboids from
// raw vertices also sidesteps the `poly-box` scale X/Y swap gotcha — poly-box
// applies a scale whose X and Y are transposed, which the old probe.html spike
// existed to demonstrate.
//
// The rail is a channel recessed into the face, exactly as wide as the metal
// strip that forms its floor.

import {
  CUBE, BEVEL, CHANNEL_W, CHANNEL_D, METAL,
} from './dimensions.js';
import { oriented, windToward } from './vec.js';

// Chamfered cuboid centred on local origin: sizes [sx, sy, sz], bevel width b.
// 6 inset faces + 12 bevel strips + 8 corner triangles = 26 polygons.
export function chamferedBox([sx, sy, sz], b, color) {
  const h = [sx / 2, sy / 2, sz / 2];       // half extents (face planes)
  const i = h.map(v => v - b);              // inset extents (face borders)
  const polys = [];

  // A vertex on the chamfered hull: corner signs [s0,s1,s2], with axis `flat`
  // pushed out to the face plane and the other two pulled in to the inset.
  const vert = (signs, flat) =>
    signs.map((s, a) => s * (a === flat ? h[a] : i[a]));

  const add = vs => polys.push({ vertices: oriented(vs), color });

  for (const s of [-1, 1]) {
    for (let a = 0; a < 3; a++) {
      // Face on axis a, side s: inset square walked corner-to-corner.
      const [u, v] = [(a + 1) % 3, (a + 2) % 3];
      add([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
        const signs = []; signs[a] = s; signs[u] = su; signs[v] = sv;
        return vert(signs, a);
      }));
      // Corner triangles for the 4 corners on side s of axis 0 (done once, a === 0).
      if (a === 0) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const signs = [s, s1, s2];
        add([vert(signs, 0), vert(signs, 1), vert(signs, 2)]);
      }
    }
  }
  // 12 bevel strips: one per edge, between the borders of its two adjacent faces.
  for (let a = 0; a < 3; a++) {                    // a = axis the edge runs along
    const [u, v] = [(a + 1) % 3, (a + 2) % 3];
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const at = (se, flat) => {
        const signs = []; signs[a] = se; signs[u] = su; signs[v] = sv;
        return vert(signs, flat);
      };
      add([at(-1, u), at(1, u), at(1, v), at(-1, v)]);
    }
  }
  return polys;
}

// A track cube: chamfered cube with a channel sunk into the top face, running
// forwards edge-to-edge (matching the real piece, where the rail is recessed).
// Surgery on the chamferedBox hull: drop the top face, the two top bevel strips
// the channel crosses, and the front/back faces; re-add them split around the
// channel opening, then add the channel walls and floor.
export function channeledCube(color) {
  const h = CUBE / 2, i = h - BEVEL;
  const wc = CHANNEL_W / 2, floor = h - CHANNEL_D;
  const eq = (a, b) => Math.abs(a - b) < 1e-6;
  // Every removed polygon lies entirely in {z = top} ∪ {|y| = front/back}.
  const polys = chamferedBox([CUBE, CUBE, CUBE], BEVEL, color)
    .filter(p => !p.vertices.every(([x, y, z]) => eq(z, h) || eq(Math.abs(y), h)));
  const add = vs => polys.push({ vertices: oriented(vs), color });

  for (const s of [-1, 1]) {
    const x0 = s * wc, x1 = s * i;
    add([[x0, -i, h], [x1, -i, h], [x1, i, h], [x0, i, h]]);            // top face half
    for (const sy of [-1, 1]) {
      add([[x0, sy * i, h], [x1, sy * i, h], [x1, sy * h, i], [x0, sy * h, i]]); // top bevel segment
      add([[s * i, sy * h, -i], [x0, sy * h, -i], [x0, sy * h, i], [s * i, sy * h, i]]); // face side rect
    }
    add([[-wc, s * h, -i], [wc, s * h, -i], [wc, s * h, floor], [-wc, s * h, floor]]); // face below channel
    // Channel wall at x = s·wc, normal facing INTO the channel (so `oriented`,
    // which points away from the origin, is wrong here — wind it by hand).
    const wall = [
      [s * wc, -h, floor], [s * wc, -h, i], [s * wc, -i, h],
      [s * wc, i, h], [s * wc, h, i], [s * wc, h, floor],
    ];
    polys.push({ vertices: s > 0 ? wall : [...wall].reverse(), color });
  }
  // Channel floor IS the metal rail: the channel is exactly as wide as the strip,
  // so the exposed floor is the strip's upper surface.
  polys.push({
    vertices: oriented([[-wc, -h, floor], [wc, -h, floor], [wc, h, floor], [-wc, h, floor]]),
    color: METAL,
  });
  return polys;
}

// The cross piece: two straight channels crossing at right angles on the top
// face — one running forwards (cutting front/back, as on the straight), one
// running left–right (cutting left/right). Same surgery as channeledCube but
// fourfold: all four side faces and top bevels split around an opening, each
// channel wall interrupted where the other channel crosses it, and the two
// floors merging into one plus-shaped metal strip.
export function crossCube(color) {
  const h = CUBE / 2, i = h - BEVEL;
  const wc = CHANNEL_W / 2, floor = h - CHANNEL_D;
  const eq = (a, b) => Math.abs(a - b) < 1e-6;
  // Remove the top face (4 top vertices), all four top bevels (2 top
  // vertices), and all four side faces; corner triangles (1 top vertex),
  // vertical bevels and everything below survive.
  const polys = chamferedBox([CUBE, CUBE, CUBE], BEVEL, color).filter(p => {
    const topCount = p.vertices.filter(v => eq(v[2], h)).length;
    const isFace = a => p.vertices.every(v => eq(Math.abs(v[a]), h));
    return topCount < 2 && !isFace(0) && !isFace(1);
  });
  const add = vs => polys.push({ vertices: oriented(vs), color });

  // Top face: the four corner squares left between the two channel openings.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    add([[sx * wc, sy * wc, h], [sx * i, sy * wc, h], [sx * i, sy * i, h], [sx * wc, sy * i, h]]);
  }
  // Both channels are the same shape rotated 90°: build one running
  // forwards (cutting the front/back faces), then the same with x/y swapped.
  const channel = swapXY => {
    const m = ([x, y, z]) => swapXY ? [y, x, z] : [x, y, z];
    for (const sy of [-1, 1]) {
      add([m([-wc, sy * h, -i]), m([wc, sy * h, -i]), m([wc, sy * h, floor]), m([-wc, sy * h, floor])]); // face below channel
      for (const s of [-1, 1]) {
        add([m([s * i, sy * h, -i]), m([s * wc, sy * h, -i]), m([s * wc, sy * h, i]), m([s * i, sy * h, i])]); // face side rect
        add([m([s * wc, sy * i, h]), m([s * i, sy * i, h]), m([s * i, sy * h, i]), m([s * wc, sy * h, i])]);   // top bevel segment
        // Channel wall at ±wc, stopping where the crossing channel cuts
        // through it — a pentagon per quadrant, facing INTO the channel.
        const pent = [
          [s * wc, sy * h, floor], [s * wc, sy * h, i], [s * wc, sy * i, h],
          [s * wc, sy * wc, h], [s * wc, sy * wc, floor],
        ].map(m);
        polys.push({ vertices: windToward(pent, m([-s, 0, 0])), color });
      }
    }
  };
  channel(false);
  channel(true);
  // The metal floor: both channels share the same depth, so the two strips
  // merge into a plus shape — centre square plus four arms. (Five convex
  // rects, not one 12-gon: PolyCSS renders concave polygons wrongly.)
  const rect = (x0, x1, y0, y1) => polys.push({
    vertices: windToward([[x0, y0, floor], [x1, y0, floor], [x1, y1, floor], [x0, y1, floor]], [0, 0, 1]),
    color: METAL,
  });
  rect(-wc, wc, -wc, wc);
  rect(-wc, wc, wc, h); rect(-wc, wc, -h, -wc);   // forwards/backwards arms
  rect(wc, h, -wc, wc); rect(-h, -wc, -wc, wc);   // right/left arms
  return polys;
}

// The outside curve: single cube whose whole top-front edge is rounded off
// (matching the physical piece), the channel wrapping over the rounding —
// in from the back edge across the top, over the crest, down the front and
// out through the bottom edge (canonical DF entry → BD exit, next cube
// directly underneath). Around the edge everything is concentric arcs about
// the same centre: the hull rounding at EDGE_R, its chamfer band at
// EDGE_R − BEVEL (which lands exactly on the side faces' inset boundary),
// and the metal floor at EDGE_R − CHANNEL_D.
export const EDGE_R = 13;            // radius the top-front edge is rounded off to
export const OUT_C = CUBE / 2 - EDGE_R; // its arc centre (y, z) = (c, c); flat faces end here
export function outsideCurve(color) {
  const h = CUBE / 2, i = h - BEVEL;
  const wc = CHANNEL_W / 2, floor = h - CHANNEL_D;
  const eq = (a, b) => Math.abs(a - b) < 1e-6;
  const NE = 8;               // facets per quarter turn
  const c = OUT_C;
  const arcPts = r => Array.from({ length: NE + 1 }, (_, j) => {
    const t = (j / NE) * Math.PI / 2;
    return [c + r * Math.sin(t), c + r * Math.cos(t)]; // (y, z), top → front
  });
  const H = arcPts(EDGE_R), Hb = arcPts(EDGE_R - BEVEL), F = arcPts(EDGE_R - CHANNEL_D);

  // Hull surgery: remove every polygon the channel or the rounding touches —
  // all six faces except we keep nothing of top/back/front/bottom/sides
  // outright removed below, plus the bevels along the affected edges and
  // the two top-front corner triangles.
  const polys = chamferedBox([CUBE, CUBE, CUBE], BEVEL, color).filter(p => {
    const cnt = f => p.vertices.filter(f).length;
    const all = f => p.vertices.every(f);
    const top = cnt(v => eq(v[2], h)), bot = cnt(v => eq(v[2], -h));
    const front = cnt(v => eq(v[1], h)), backOrFront = cnt(v => eq(Math.abs(v[1]), h));
    const side = cnt(v => eq(Math.abs(v[0]), h));
    return !(all(v => eq(v[2], h)) || all(v => eq(v[2], -h))
      || all(v => eq(Math.abs(v[1]), h)) || all(v => eq(Math.abs(v[0]), h))
      || (top >= 2 && backOrFront >= 2)  // back-top bevel (front-top too)
      || (bot >= 2 && front >= 2)        // front-bottom bevel
      || (top >= 2 && side >= 2)         // side-top bevels
      || (front >= 2 && side >= 2)       // side-front bevels
      || (top >= 1 && front >= 1));      // top-front corner triangles
  });
  const add = vs => polys.push({ vertices: oriented(vs), color });

  add([[-wc, -h, -i], [wc, -h, -i], [wc, -h, floor], [-wc, -h, floor]]); // back face below channel
  add([[-i, -i, -h], [i, -i, -h], [i, floor, -h], [-i, floor, -h]]);     // bottom face short of the exit mouth
  for (const s of [-1, 1]) {
    add([[s * wc, -i, h], [s * i, -i, h], [s * i, c, h], [s * wc, c, h]]);       // top face strip, to the rounding
    add([[s * i, -h, -i], [s * wc, -h, -i], [s * wc, -h, i], [s * i, -h, i]]);   // back face side rect
    add([[s * i, h, -i], [s * wc, h, -i], [s * wc, h, c], [s * i, h, c]]);       // front face strip, to the rounding
    add([[s * wc, -i, h], [s * i, -i, h], [s * i, -h, i], [s * wc, -h, i]]);     // back-top bevel segment
    add([[s * wc, h, -i], [s * i, h, -i], [s * i, i, -h], [s * wc, i, -h]]);     // front-bottom bevel segment
    add([[s * wc, floor, -h], [s * i, floor, -h], [s * i, i, -h], [s * wc, i, -h]]); // bottom face beside exit mouth
    add([[s * i, -i, h], [s * i, c, h], [s * h, c, i], [s * h, -i, i]]);         // side-top bevel, stops at the rounding
    add([[s * i, h, -i], [s * i, h, c], [s * h, i, c], [s * h, i, -i]]);         // side-front bevel, stops at the rounding
    // Side face with its top-front corner following the rounding's chamfer.
    add([[-i, i], ...Hb, [i, -i], [-i, -i]].map(([y, z]) => [s * h, y, z]));
    // The rounded edge itself and its chamfer band down to the side face.
    for (let j = 0; j < NE; j++) {
      add([[s * wc, ...H[j]], [s * i, ...H[j]], [s * i, ...H[j + 1]], [s * wc, ...H[j + 1]]]);
      add([[s * i, ...H[j]], [s * h, ...Hb[j]], [s * h, ...Hb[j + 1]], [s * i, ...H[j + 1]]]);
    }
    // Channel wall at x = ±wc: flat slabs fore and aft of the corner, then
    // radial strips between the floor arc and the hull arc.
    const wall = vs => polys.push({
      vertices: windToward(vs.map(([y, z]) => [s * wc, y, z]), [-s, 0, 0]),
      color,
    });
    wall([[-h, floor], [c, floor], [c, h], [-i, h], [-h, i]]);   // top-back slab
    wall([[floor, c], [floor, -h], [i, -h], [h, -i], [h, c]]);   // front slab
    for (let j = 0; j < NE; j++) wall([F[j], F[j + 1], H[j + 1], H[j]]);
  }
  // The metal floor: flat top run, arc facets over the crest, flat front run.
  const fl = [[-h, floor], ...F, [floor, -h]];
  for (let k = 0; k < fl.length - 1; k++) {
    const [[y0, z0], [y1, z1]] = [fl[k], fl[k + 1]];
    polys.push({
      vertices: oriented([[-wc, y0, z0], [wc, y0, z0], [wc, y1, z1], [-wc, y1, z1]]),
      color: METAL,
    });
  }
  return polys;
}

// ---- Arc pieces: quarter-donut bodies built by profile sweep -------------
// The cross-section perpendicular to travel — a chamfered square with the
// channel notch cut into the w = +h side — is placed at stations along a
// quarter arc and neighbouring stations are stitched with quads.
// u = transverse (canonical right), w = the side the channel faces.
// Traversal order is chosen so swept quads wind outward; the channel-floor
// edge is the metal strip.
const SEGMENTS = 8;
export const ARC_R = 1.5 * CUBE; // centreline radius; body spans CUBE..2·CUBE
// Two pieces that click together have to look like two pieces, and a swept body
// gets its half of that groove the same way a cube does: the cross-section at
// travel-distance d from a mouth is the profile clamped to a square of half
// extent min(i + d, h), so the last BEVEL of the piece chamfers in to the same
// inset mouth face a cube presents. The channel notch (wc, floor) lies inside
// the inset, so it — and the metal strip that floors it — run the full arc
// untouched, bridging the groove exactly as the strip runs straight across a
// cube-to-cube join, and the wheels never cross a gap.
const PROFILE = (() => {
  const h = CUBE / 2, i = h - BEVEL, wc = CHANNEL_W / 2, floor = h - CHANNEL_D;
  return {
    pts: [
      [wc, h], [i, h], [h, i], [h, -i], [i, -h], [-i, -h],
      [-h, -i], [-h, i], [-i, h], [-wc, h], [-wc, floor], [wc, floor],
    ],
    metalEdge: 10, // (-wc, floor) → (wc, floor): the channel floor
    // End caps are the profile's area — concave (the notch), so decomposed
    // into three convex pieces: the columns either side of the channel and
    // the slab underneath it. (PolyCSS renders concave polygons wrongly.)
    caps: [
      [[-wc, h], [-i, h], [-h, i], [-h, -i], [-i, -h], [-wc, -h]],
      [[wc, h], [wc, -h], [i, -h], [h, -i], [h, i], [i, h]],
      [[-wc, floor], [-wc, -h], [wc, -h], [wc, floor]],
    ],
  };
})();

// The mouth cross-section: the profile pulled in to the inset square the
// chamfered cubes present at every face. The channel notch is inside it, so
// only the outer boundary moves, and the profile's two 45° corner points
// collapse onto one — which is what makes the corner triangles.
const INSET = CUBE / 2 - BEVEL;
const clamped = ([u, w]) => [u, w].map(v => Math.max(-INSET, Math.min(INSET, v)));
const same = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-9);
const dedupe = vs => vs.filter((v, k) => !same(v, vs[(k + 1) % vs.length]));

// Sweep the profile along a quarter arc. `map(u, w, θ)` places a profile
// point at station θ ∈ [0, π/2]; the piece's centreline — the future train
// path — is map(0, floor, θ). `radius(u, w)` is that point's arc radius, which
// converts BEVEL of travel into an angle — one angle per point, since travel
// per radian grows with radius. Entry/exit caps face along entryDir/exitDir.
function sweepPiece(map, radius, color, entryDir, exitDir) {
  const polys = [];
  const inner = Array.from({ length: SEGMENTS - 1 }, (_, j) => ((j + 1) / SEGMENTS) * Math.PI / 2);
  // Stations for each profile point: mouth, chamfer end, interior…, and back.
  const stations = PROFILE.pts.map(([u, w]) => {
    const a = Math.asin(BEVEL / radius(u, w)); // exactly BEVEL of travel in
    return [0, a, ...inner, Math.PI / 2 - a, Math.PI / 2];
  });
  const last = stations[0].length - 1;
  // At the two mouth stations the point is pulled in; everywhere else it is full size.
  const at = (k, s) => map(...(s === 0 || s === last ? clamped(PROFILE.pts[k]) : PROFILE.pts[k]),
    stations[k][s]);

  for (let s = 0; s < last; s++) {
    PROFILE.pts.forEach((_, k) => {
      const k1 = (k + 1) % PROFILE.pts.length;
      const quad = dedupe([at(k, s), at(k1, s), at(k1, s + 1), at(k, s + 1)]);
      if (quad.length < 3) return;  // the chamfer band's corner quads are triangles
      polys.push({ vertices: quad, color: k === PROFILE.metalEdge ? METAL : color });
    });
  }
  for (const [t, dir] of [[0, entryDir], [Math.PI / 2, exitDir]]) {
    for (const cap of PROFILE.caps) {
      const vs = dedupe(cap.map(p => map(...clamped(p), t)));
      polys.push({ vertices: windToward(vs, dir), color });
    }
  }
  return polys;
}

// The two sweep maps, shared by the geometry below and by the train's path:
// left curve is a flat quarter arc across the 2×2 ground footprint, arc centre
// at the footprint's far-left corner, rail staying on top (w → z); inside curve
// is the same donut stood upright, w pointing towards the arc centre.
export const ARC_MAP = {
  leftCurve: (u, w, t) =>
    [-ARC_R + (ARC_R + u) * Math.cos(t), -CUBE / 2 + (ARC_R + u) * Math.sin(t), w],
  insideCurve: (u, w, t) =>
    [u, -CUBE / 2 + (ARC_R - w) * Math.sin(t), ARC_R - (ARC_R - w) * Math.cos(t)],
};

export function leftCurve(color) {
  return sweepPiece(ARC_MAP.leftCurve, (u) => ARC_R + u, color, [0, -1, 0], [-1, 0, 0]);
}
// Right curve: the left curve mirrored (reversing winding to keep normals out).
const mirrorX = polys => polys.map(p => ({
  ...p, vertices: p.vertices.map(([x, y, z]) => [-x, y, z]).reverse(),
}));
export const rightCurve = color => mirrorX(leftCurve(color));

// Inside curve: the same quarter donut stood in the vertical plane, channel
// on the concave face (w → towards the arc centre, up-and-over the valley).
export function insideCurve(color) {
  return sweepPiece(ARC_MAP.insideCurve, (u, w) => ARC_R - w, color, [0, -1, 0], [0, 0, 1]);
}

/** Geometry generator per piece type, all authored in the canonical DF pose. */
export const GEOMETRY = {
  straight: channeledCube,
  cross: crossCube,
  outsideCurve,
  leftCurve,
  rightCurve,
  insideCurve,
};
