// The imperative PolyCSS binding: everything that talks to a live scene.
//
// The old spike did this once, for one scene, with one rAF loop running for the
// life of the page. A page with several viewers on it cannot do that — ten
// viewers would mean ten permanent loops — so a viewer here owns its own loop
// and can be started, stopped and destroyed.

import { GEOMETRY } from './pieces.js';
import { trainBody } from './train.js';
import { trackPath } from './rail.js';
import { SPEED, BODY_Z, TRAIN_H } from './dimensions.js';
import { rotate, translate, toWorld, poseRotation, cross, sub, len, unit } from './vec.js';
import { createCamera } from './camera.js';

// The height of the body's centre above the rail — the point whose motion the
// eye reads as the train's speed. Matches where `trainBody` puts the shell.
const BODY_REF = BODY_Z + TRAIN_H / 2;

/** PolyCSS's `add` takes a loader result; hand-built geometry fakes one. */
const meshLike = polygons => ({ polygons, objectUrls: [], warnings: [], dispose: () => {} });

/**
 * Bind a viewer to a mounted `<poly-camera>` containing a `<poly-scene>`.
 * The caller is responsible for having awaited `customElements.whenDefined`.
 */
export function createViewer(cameraEl, sceneEl) {
  const scene = sceneEl.getScene();
  const { frameTo, applyCamera } = createCamera(cameraEl);

  // Cubes only. A crossed cross is in the route twice — the train drives over it
  // both times — but there is one cube there, so the second pass must not mesh a
  // duplicate on top of the first. The train still gets the whole route.
  //
  // Nothing is reused across a redraw: a different layout is a different number
  // of pieces in different places, and PolyCSS re-mounts a mesh whose geometry
  // changes anyway. This happens a handful of times per solve, not per frame.
  let drawn = [];
  let place = null;          // the train's mesh setter, built on first use
  let trainHandle = null;
  let path = [], gaps = [], lap = 0;
  let k = 0, travelled = 0;  // travelled = distance to the start of sample k
  let frame = null;          // the rAF handle, null when stopped
  let clock = 0;             // our own clock, so pausing does not teleport the train
  let last = null;

  function draw(pieces) {
    for (const handle of drawn) handle.dispose();
    drawn = pieces.filter(p => !p.revisit).map(({ cell, type, pose, color }) => {
      const polygons = translate(rotate(GEOMETRY[type](color), poseRotation(pose)), toWorld(cell));
      return scene.add(meshLike(polygons), {});
    });
  }

  /** Hand the train a new route. Safe to call with the same pieces repeatedly. */
  function setRoute(pieces) {
    if (!pieces?.length) return;
    // Built on the first route, not up front: an unhinted solve has nothing
    // drawn for its first few seconds, and a train parked in mid-air over no
    // track at all is a worse picture than an empty box.
    if (!place) {
      const body = trainBody();
      trainHandle = scene.add(meshLike(body), {});
      place = (position, basis) => {
        trainHandle.setPolygons(rotate(body, basis), { stableDom: true });
        trainHandle.setTransform({ position });
      };
    }
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
    k = 0; travelled = 0; // the cursor indexed the old path; it means nothing now
  }

  // Between two rail samples both the heading and the up direction are blended
  // and squared back up, so the train leans into the corners instead of snapping
  // between facets.
  function step(now) {
    frame = requestAnimationFrame(step);
    if (last !== null) clock += now - last;
    last = now;
    if (!lap || !place) return; // no track yet, so nowhere to put a train

    let d = (clock / 1000 * SPEED) % lap;
    if (d < travelled) { k = 0; travelled = 0; } // lapped: back to the start
    while (d - travelled >= gaps[k]) { travelled += gaps[k]; k = (k + 1) % path.length; }

    const a = path[k], b = path[(k + 1) % path.length], f = (d - travelled) / gaps[k];
    const blend = (p, q) => p.map((v, i) => v + (q[i] - v) * f);
    const fwd = unit(blend(a.fwd, b.fwd));
    const raw = blend(a.up, b.up);
    const dot = raw.reduce((acc, v, i) => acc + v * fwd[i], 0);
    const up = unit(raw.map((v, i) => v - dot * fwd[i])); // square up against the heading
    place(blend(a.pos, b.pos), [cross(fwd, up), fwd, up]);
  }

  function start() {
    if (frame !== null) return;
    last = null; // a fresh delta, so time spent stopped is not travelled through
    frame = requestAnimationFrame(step);
  }

  function stop() {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
  }

  function destroy() {
    stop();
    for (const handle of drawn) handle.dispose();
    drawn = [];
    trainHandle?.dispose();
    trainHandle = null;
    place = null;
    lap = 0;
  }

  return { draw, setRoute, frameTo, applyCamera, start, stop, destroy };
}
