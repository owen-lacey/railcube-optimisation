// Driving the train round a route.
//
// Lifted out of the one viewer there used to be, when the builder needed a lap of
// its own: the pacing below took a couple of attempts to get right, and two copies
// of it would be two copies to get wrong.
//
// A train belongs to a *phase* rather than to the stage, because it is the one
// thing on screen that is not a cube. That makes it the one thing a phase has to
// take away with it — `stage.js` calls `dispose` on a phase it drops, and without
// that a track that collapses leaves its train hanging in mid-air over the
// wreckage. Which it did.

import { trackPath } from './rail.js';
import { SPEED, BODY_Z, TRAIN_H } from './dimensions.js';
import { cross, add, sub, len, unit, toCell } from './vec.js';

// The height of the body's centre above the rail — the point whose motion the
// eye reads as the train's speed. Matches where `trainBody` puts the shell.
const BODY_REF = BODY_Z + TRAIN_H / 2;

// The train's polygons are authored facing forwards, and it is mounted turned by
// nothing. Its colours carry the lighting of that authored pose (see `carriedShade`
// in meshes.js), so it keeps it for the whole lap rather than re-lighting on a bank
// or a wall — Owen's call, and the picture the site has always drawn.
const UNTURNED = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Bind a train to a live stage. It has no mesh until it has a route. */
export function createDriver(stage) {
  let mesh = null;
  let path = [], gaps = [], lap = 0;
  let entries = [];          // how far along the lap each piece begins, in route order
  let cells = [];            // the cell the train is in as it enters each piece
  let k = 0, travelled = 0;  // travelled = distance to the start of sample k

  /** Hand the train a new route. Safe to call with the same pieces repeatedly. */
  function setRoute(pieces) {
    if (!pieces?.length) return;
    // Built on the first route, not up front: an unhinted solve has nothing
    // drawn for its first few seconds, and a track being built has nothing drawn
    // for the first one. A train parked in mid-air over no track at all is a
    // worse picture than an empty box.
    if (!mesh) mesh = stage.train(UNTURNED, [0, 0, 0]);
    path = trackPath(pieces);
    // Pace the train by the body, not by the wheels. A rail sample is the point
    // where the wheels touch the strip, and the body rides BODY_REF above it, so
    // on a curve the body sweeps a different radius from the rail: 1.59× on the
    // outside curve, whose rail hugs the cube's rounded edge at radius 11, and
    // 0.70× on the inside curve. Holding the contact point at a constant speed
    // therefore makes the visible train lurch through the red pieces and dawdle
    // through the orange ones. Measuring the gaps on the body's own path instead
    // holds the thing you can actually see at SPEED, and lets the wheels vary.
    const ref = p => p.pos.map((v, i) => v + p.up[i] * BODY_REF);
    gaps = path.map((p, i) => len(sub(ref(path[(i + 1) % path.length]), ref(p))));
    lap = gaps.reduce((a, b) => a + b, 0);
    // `trackPath` lays the same number of samples down for every piece, revisits
    // included, so piece i begins at sample i × per and a crossed cross begins twice.
    const per = path.length / pieces.length;
    entries = pieces.map((_, i) => gaps.slice(0, i * per).reduce((a, b) => a + b, 0));
    cells = pieces.map(piece => piece.cell);
    k = 0; travelled = 0; // the cursor indexed the old path; it means nothing now
  }

  /**
   * Put the train where it has got to after `seconds` of driving, and say how far
   * round the lap that is, from 0 up to (but never reaching) 1.
   */
  function at(seconds) {
    if (!lap) return null;   // no track yet, so nowhere to put a train
    const d = (seconds * SPEED) % lap;
    // The lattice cell is the one the body is in, not the wheels: the body is what
    // is seen, and it rides clear of the cube, in the cell the model books as train.
    stage.markTrainCell(toCell(place(d)));
    return d / lap;
  }

  /**
   * Put the train where it enters piece `i`. One past the last piece is a whole
   * lap on, which on a closed loop is exactly where the first one is.
   *
   * The cell marked is the piece's own, the model's head as the piece begins,
   * rather than read off the body: at a piece's entry the body is exactly on the
   * face between two cells, and rounding it picks whichever floating point says.
   */
  function toPiece(i) {
    if (!lap) return;
    place(entries[i % entries.length]);
    stage.markTrainCell(cells[i % cells.length]);
  }

  /**
   * Put the train `d` along the lap, measured on the body's path, and say where
   * its body is.
   *
   * Between two rail samples both the heading and the up direction are blended
   * and squared back up, so the train leans into the corners instead of snapping
   * between facets.
   */
  function place(d) {
    if (d < travelled) { k = 0; travelled = 0; } // lapped, or dragged back: from the start
    while (d - travelled >= gaps[k]) { travelled += gaps[k]; k = (k + 1) % path.length; }

    const a = path[k], b = path[(k + 1) % path.length], f = (d - travelled) / gaps[k];
    const blend = (p, q) => p.map((v, i) => v + (q[i] - v) * f);
    const fwd = unit(blend(a.fwd, b.fwd));
    const raw = blend(a.up, b.up);
    const dot = raw.reduce((acc, v, i) => acc + v * fwd[i], 0);
    const up = unit(raw.map((v, i) => v - dot * fwd[i])); // square up against the heading
    const pos = blend(a.pos, b.pos);
    mesh.place([cross(fwd, up), fwd, up], pos);
    stage.invalidate();
    return add(pos, up.map(v => v * BODY_REF));
  }

  function dispose() {
    stage.markTrainCell(null);
    mesh?.dispose();
    stage.invalidate();
    mesh = null;
    lap = 0;
  }

  return { setRoute, at, toPiece, dispose, driving: () => lap > 0 };
}
