// Drawing a physics run: the binding between the cannon world in `physics.js`
// and a live PolyCSS scene.
//
// The track viewer next door draws a track that never moves and a train that
// does. Here every piece moves, and that changes what a frame has to cost.
//
// The train can afford to have its orientation baked into its vertices every
// frame — `setPolygons` — because it is one mesh of about fifty polygons. A
// falling layout is eighteen meshes of over a hundred each, and `setPolygons`
// rebuilds a `matrix3d` per polygon: two thousand of them per frame, which drops
// the frame rate through the floor. Measured, having first shipped it that way.
//
// So orientation goes through `setTransform` instead, which writes one transform
// to one container element per piece. That takes Euler degrees in PolyCSS's own
// frame rather than a rotation, which is what `polyRotation` in `vec.js` is for.
//
// One thing is given up by moving the rotation out of the vertices: PolyCSS
// shades each polygon from its normal, and a CSS rotation cannot recompute a
// normal, so a piece carries its lighting around with it as it turns. Two things
// keep that from being visible. Each mesh is mounted already rotated into the
// pose the layout put it in, so the rotation the container carries is only what
// has changed *since the fall started* — the first frame is lit exactly as the
// static viewer lights it. And when a piece stops moving its resting orientation
// is baked into its vertices once, which re-lights it, so the settled pile
// everyone actually looks at is correct. The approximation exists only while
// something is mid-air.

import { GEOMETRY, chamferedBox } from './pieces.js';
import { CUBE, BEVEL } from './dimensions.js';
import { rotate, translate, compose, transpose, polyRotation } from './vec.js';
import { createCamera } from './camera.js';
import { createWorld, CENTROID, basisOf, isAsleep } from '../physics.js';

const FLOOR_THICKNESS = 6;
const FLOOR_COLOR = '#334155';
const FLOOR_MARGIN = 3;   // cubes of floor to leave around the layout for the pile to spread into

// How long a fall is given before the loop stops whatever the pile is doing.
//
// Sleeping alone is not enough to end it, which was measured rather than
// assumed: an 18-cube pile has 16 of its 18 bodies asleep within about four
// seconds, and then two arcs resting against each other rock gently against one
// another for ever, crossing the sleep threshold and coming back. Damping was
// tried and does not settle them either — a segmented approximation of a curve
// has small notches for a corner to drop into, and there is always somewhere to
// fall. The motion by then is under a fifth of a cube a second and nothing worth
// watching is still happening, so the honest thing is a deadline.
const SETTLE_LIMIT = 10;   // simulated seconds

/** PolyCSS's `add` takes a loader result; hand-built geometry fakes one. */
const meshLike = polygons => ({ polygons, objectUrls: [], warnings: [], dispose: () => {} });

const positionOf = body => [body.position.x, body.position.y, body.position.z];

/** A slab under the layout, wide enough that nothing slides off the edge of it. */
function floorSlab(pieces, floorZ) {
  const cells = pieces.flatMap(p => p.material);
  const lo = a => Math.min(...cells.map(c => c[a]));
  const hi = a => Math.max(...cells.map(c => c[a]));
  const mid = a => (lo(a) + hi(a)) / 2;
  const span = a => hi(a) - lo(a) + 1;
  const width = (Math.max(span(0), span(2)) + 2 * FLOOR_MARGIN) * CUBE;
  // Project-frame axis 0 is right and axis 2 is forwards, which are the floor's
  // two horizontal directions; axis 1 is up, and the floor's height comes from
  // the world instead, since it is the world that decided where it is.
  return translate(chamferedBox([width, width, FLOOR_THICKNESS], BEVEL, FLOOR_COLOR),
    [mid(0) * CUBE, mid(2) * CUBE, floorZ - FLOOR_THICKNESS / 2]);
}

/**
 * Bind a tumbler to a mounted `<poly-camera>` containing a `<poly-scene>`.
 * The caller is responsible for having awaited `customElements.whenDefined`.
 */
export function createTumbler(cameraEl, sceneEl) {
  const scene = sceneEl.getScene();
  const { frameTo, applyCamera } = createCamera(cameraEl);

  let sim = null;
  let drawn = [];      // one per cube, see `drop` for the shape
  let floor = null;
  let frame = null;    // the rAF handle, null when stopped
  let last = null;
  let elapsed = 0;     // simulated seconds since this fall began

  /**
   * Bake an orientation into a mesh's vertices and hand the container nothing to
   * rotate. This is the expensive call, so it happens when a piece comes to rest
   * — where it buys correct lighting for as long as the piece is looked at — and
   * not every frame.
   */
  function bake(mesh, basis) {
    mesh.handle.setPolygons(rotate(mesh.canonical, basis), { stableDom: true });
    mesh.handle.setTransform({ position: positionOf(mesh.body), rotation: [0, 0, 0] });
    mesh.baked = basis;
    mesh.inverse = transpose(basis);
    mesh.resting = true;
  }

  /** Write every moving body's current pose onto its mesh. */
  function place() {
    for (const mesh of drawn) {
      const asleep = isAsleep(mesh.body);
      if (asleep && mesh.resting) continue;   // nothing has changed, and nothing will
      const basis = basisOf(mesh.body.quaternion);
      if (asleep) {
        bake(mesh, basis);
        continue;
      }
      // Awake again after resting is fine: the delta is measured from whatever
      // orientation is currently in the vertices, not from the original pose.
      mesh.resting = false;
      mesh.handle.setTransform({
        position: positionOf(mesh.body),
        rotation: polyRotation(compose(basis, mesh.inverse)),
      });
    }
  }

  /** Re-light everything still in the air, for the frame the loop stops on. */
  function settle() {
    for (const mesh of drawn) {
      if (!mesh.resting) bake(mesh, basisOf(mesh.body.quaternion));
    }
  }

  function step(now) {
    frame = requestAnimationFrame(step);
    const delta = last === null ? 0 : (now - last) / 1000;
    last = now;
    if (!sim || !delta) return;
    // Cap the catch-up: a tab that was in the background for a minute must not
    // try to simulate a minute in one frame.
    const tick = Math.min(delta, 0.1);
    elapsed += tick;
    sim.step(tick);
    place();
    if (sim.settled() || elapsed > SETTLE_LIMIT) {
      settle();
      stop();
    }
  }

  /**
   * Stand a layout up and hand it to gravity. Called again, it starts over —
   * which is what a "drop it again" control does.
   */
  function drop(pieces, options) {
    clear();
    elapsed = 0;
    sim = createWorld(pieces, options);
    floor = scene.add(meshLike(floorSlab(pieces, sim.floorZ)), {});
    drawn = sim.bodies.map(({ piece, body }) => {
      // Drawn about the body's centre of mass rather than about the cell origin
      // the geometry was authored around, because the centre of mass is the point
      // cannon reports a position for. `place` then needs no per-piece offset.
      const canonical = translate(GEOMETRY[piece.type](piece.color),
        CENTROID[piece.type].map(v => -v));
      const mesh = {
        body,
        canonical,
        handle: scene.add(meshLike(canonical), {}),
        resting: false,
      };
      // Mounted in the pose the layout put it in, so the first frame is the
      // track exactly as the static viewer draws it — lighting included.
      bake(mesh, basisOf(body.quaternion));
      return mesh;
    });
  }

  function start() {
    if (frame !== null || !sim || sim.settled() || elapsed > SETTLE_LIMIT) return;
    last = null; // a fresh delta, so time spent stopped is not simulated through
    frame = requestAnimationFrame(step);
  }

  function stop() {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
  }

  function clear() {
    stop();
    for (const { handle } of drawn) handle.dispose();
    drawn = [];
    floor?.dispose();
    floor = null;
    sim = null;
  }

  return { drop, frameTo, applyCamera, start, stop, destroy: clear };
}
