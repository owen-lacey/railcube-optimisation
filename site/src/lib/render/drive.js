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
import { cubeOf } from '../../../../src/track.js';
import { SPEED, BODY_Z, TRAIN_H } from './dimensions.js';
import { cross, add, sub, len, unit, toCell } from './vec.js';

// The height of the body's centre above the rail — the point whose motion the
// eye reads as the train's speed. Matches where `trainBody` puts the shell.
const BODY_REF = BODY_Z + TRAIN_H / 2;

/**
 * The rail `f` of the way from sample `a` to sample `b`, as a sample.
 *
 * Both the heading and the up direction are blended and squared back up, so a
 * train leans into the corners instead of snapping between facets.
 */
function railPoint(a, b, f) {
  const blend = (p, q) => p.map((v, i) => v + (q[i] - v) * f);
  const fwd = unit(blend(a.fwd, b.fwd));
  const raw = blend(a.up, b.up);
  const dot = raw.reduce((acc, v, i) => acc + v * fwd[i], 0);
  const up = unit(raw.map((v, i) => v - dot * fwd[i])); // square up against the heading
  return { pos: blend(a.pos, b.pos), fwd, up };
}

/** A train's basis standing on a rail sample, `[right, fwd, up]`. */
const frameOf = ({ fwd, up }) => [cross(fwd, up), fwd, up];

/** Where a train's body is, standing on a rail sample. */
const bodyOf = ({ pos, up }) => add(pos, up.map(v => v * BODY_REF));

// The train's polygons are authored facing forwards, and it is mounted turned by
// nothing. Its colours carry the lighting of that authored pose (see `carriedShade`
// in meshes.js), so it keeps it for the whole lap rather than re-lighting on a bank
// or a wall — Owen's call, and the picture the site has always drawn.
const UNTURNED = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * Bind a train to a live stage. It has no mesh until it has a route. `byPiece`
 * marks the cube of the piece it is on for the whole of that piece, so the mark
 * moves only once a piece is finished, rather than the cell the body is in
 * following it through the piece.
 */
export function createDriver(stage, { byPiece = false } = {}) {
  let mesh = null;
  let path = [], gaps = [], lap = 0;
  let entries = [];          // how far along the lap each piece begins, in route order
  let cubes = [];            // each piece's cube, where it is on the track
  let poses = [];            // and its pose then
  let per = 0;               // rail samples per piece
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
    gaps = path.map((p, i) => len(sub(bodyOf(path[(i + 1) % path.length]), bodyOf(p))));
    lap = gaps.reduce((a, b) => a + b, 0);
    // `trackPath` lays the same number of samples down for every piece, revisits
    // included, so piece i begins at sample i × per and a crossed cross begins twice.
    per = path.length / pieces.length;
    entries = pieces.map((_, i) => gaps.slice(0, i * per).reduce((a, b) => a + b, 0));
    cubes = pieces.map(piece => cubeOf(piece.cell, piece.pose));
    poses = pieces.map(piece => piece.pose);
    k = 0; travelled = 0; // the cursor indexed the old path; it means nothing now
  }

  /**
   * Put the train where it has got to after `seconds` of driving from the entry of
   * piece `from`, and say which piece in route order it is on.
   */
  function at(seconds, from = 0) {
    if (!lap) return null;   // no track yet, so nowhere to put a train
    const d = (entries[from % entries.length] + seconds * SPEED) % lap;
    const body = place(d);
    // The pose is the last piece entered's: `place` leaves the cursor on the
    // current sample, and every piece has `per` of them.
    const piece = Math.floor(k / per);
    // The lattice cell is the one the body is in, not the wheels: the body is what
    // is seen, and it rides clear of the cube, in the cell the model books as train.
    if (byPiece) stage.markTrainPiece(cubes[piece]);
    else stage.markTrainCell(toCell(body));
    stage.markTrainPose(poses[piece]);
    return piece;
  }

  /**
   * Put the train where it enters piece `i`, and mark that piece's cube. One past
   * the last piece is a whole lap on, which on a closed loop is exactly where the
   * first one is.
   */
  function toPiece(i) {
    if (!lap) return;
    place(entries[i % entries.length]);
    stage.markTrainPiece(cubes[i % cubes.length]);
    stage.markTrainPose(poses[i % poses.length]);
  }

  /**
   * Put the train `d` along the lap, measured on the body's path, and say where
   * its body is.
   */
  function place(d) {
    if (d < travelled) { k = 0; travelled = 0; } // lapped, or dragged back: from the start
    while (d - travelled >= gaps[k]) { travelled += gaps[k]; k = (k + 1) % path.length; }

    const at = railPoint(path[k], path[(k + 1) % path.length], (d - travelled) / gaps[k]);
    mesh.place(frameOf(at), at.pos);
    stage.invalidate();
    return bodyOf(at);
  }

  function dispose() {
    if (byPiece) stage.markTrainPiece(null);
    else stage.markTrainCell(null);
    stage.markTrainPose(null);
    mesh?.dispose();
    stage.invalidate();
    mesh = null;
    lap = 0;
  }

  return { setRoute, at, toPiece, dispose, driving: () => lap > 0 };
}
