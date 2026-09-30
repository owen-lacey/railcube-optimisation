// Applying a camera description to a three.js `OrthographicCamera`.
//
// A description is `{ zoom, target, 'rot-x', 'rot-y' }` — the shape every camera in
// `scenes.js` is written in. It started as the attributes of PolyCSS's
// `<poly-camera>`, and it is kept exactly, so that every shot in the catalogue
// frames the same picture it always did. `polyView` below is that camera
// reproduced, measured pixel for pixel against PolyCSS in the fidelity spike.
//
// It is `stage.js` that binds it, exactly once per viewer.

import { Matrix4, Vector3 } from 'three';

// Every camera in the scene catalogue — the auto-framed ones and the hand-tuned
// ones alike — was calibrated against the old spike's fixed 900px-wide canvas.
// Here a viewer might be a 320px card or a full-width hero, so the zoom has to
// be scaled by how wide it actually is, or a layout framed to fit is cropped on
// every card.
export const REFERENCE_WIDTH = 900;
export const REFERENCE_HEIGHT = 700;
// A little slack so a layout framed to exactly fill the box does not touch the
// edges — the framing measures cubes, and a train riding on the outside of the
// top ones sits proud of that.
const MARGIN = 0.88;

/**
 * What a viewer shows before anything is described: an isometric angle, turned so
 * forwards runs *away* from the reader, up and to the right — the viewer frame of
 * docs/coordinates.md — and a track sets off from the bottom left. The classic
 * turn (+45) has forwards coming at them instead, down and to the right. A
 * hand-moved view starts from these when a description names no rotation.
 */
export const CAMERA = { 'rot-x': 65, 'rot-y': -45, zoom: 4, target: '0,0,0' };

const numbers = target => String(target).split(',').map(Number);
const rad = d => d * Math.PI / 180;
const DISTANCE = 2000;   // world units back from the target; anything drawn is far inside

/**
 * A description with someone's hand on the camera: `view` is what they have done
 * to it, `{ rotX, rotY, zoomBy, offset }`, and null when nobody has touched it.
 *
 * It is an *adjustment* rather than a camera, and that is the whole reason it is
 * here and not in the controls. The stage rewrites the description whenever it
 * likes — a resize, a `frameTo`, every frame of a `panTo` — and a camera the
 * controls had set absolutely would be overwritten each time. Composed on top
 * instead, the turn and the pan survive all of that, and a zoom stays the same
 * *proportion* of whatever the frame is. The rotation is the exception: it is
 * absolute, because nothing describes a rotation that ever changes.
 */
export function adjusted(described, view) {
  if (!view) return described;
  const base = { ...CAMERA, ...described };
  return {
    ...base,
    'rot-x': view.rotX,
    'rot-y': view.rotY,
    zoom: Number(base.zoom) * view.zoomBy,
    target: numbers(base.target).map((v, a) => v + view.offset[a]).join(','),
  };
}

/**
 * The zoom a description comes to at this viewer size: pixels per world unit.
 * Whichever dimension runs out first decides the fit, so a tall narrow card and a
 * wide short one are both framed by their tighter side.
 */
export function appliedZoom(zoom, width, height) {
  const fit = Math.min(width, height * (REFERENCE_WIDTH / REFERENCE_HEIGHT));
  return Number(zoom) * (fit / REFERENCE_WIDTH) * MARGIN;
}

/**
 * Put an OrthographicCamera where the description says, for a `width`×`height`
 * viewer, and return the zoom applied.
 *
 * The direction *towards the viewer* is `(sin rotX · cos rotY, sin rotX · sin rotY,
 * cos rotX)` in world right/forwards/up — rot-x 0 is straight down, 90 is side-on
 * — with world up projecting to screen-up, and one world unit is the applied zoom
 * in screen pixels. That is PolyCSS's scene transform, `scale(zoom/50) rotateX(rotX)
 * rotate(rotY) translate3d(-target)` over a frame with right and forwards swapped
 * and 50px to the unit, read the other way round.
 *
 * The orientation is written down rather than got from `lookAt`, because straight
 * down (rot-x 0, which the controls can reach) is exactly where "keep world up
 * pointing up the screen" stops meaning anything. Screen right is
 * `(−sin rotY, cos rotY, 0)` at every tilt — the limit `lookAt` approaches — and
 * screen up completes the frame.
 */
export function polyView(camera, description, width, height) {
  const base = { ...CAMERA, ...description };
  const zoom = appliedZoom(base.zoom, width, height);
  const tilt = rad(Number(base['rot-x']));
  const turn = rad(Number(base['rot-y']));
  const towards = new Vector3(Math.sin(tilt) * Math.cos(turn), Math.sin(tilt) * Math.sin(turn), Math.cos(tilt));
  const right = new Vector3(-Math.sin(turn), Math.cos(turn), 0);
  const up = new Vector3().crossVectors(towards, right);
  const target = new Vector3(...numbers(base.target));
  camera.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, towards));
  camera.position.copy(target).addScaledVector(towards, DISTANCE);
  camera.left = -width / 2 / zoom;
  camera.right = width / 2 / zoom;
  camera.top = height / 2 / zoom;
  camera.bottom = -height / 2 / zoom;
  camera.near = 1;
  camera.far = DISTANCE * 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return zoom;
}

/**
 * Bind camera handling to a three camera. `size()` is the viewer's size in CSS
 * pixels, read afresh on every application; `onApply` is told after each one.
 */
export function createCamera(camera, size, onApply) {
  let described = {};
  let view = null;
  let applied = { ...CAMERA, zoom: appliedZoom(CAMERA.zoom, REFERENCE_WIDTH, REFERENCE_HEIGHT) };

  /** (Re-)apply the current description at the viewer's current size. */
  function applyCamera() {
    const { width, height } = size();
    const w = width || REFERENCE_WIDTH;
    const h = height || REFERENCE_HEIGHT;
    const shot = { ...CAMERA, ...adjusted(described, view) };
    applied = { ...shot, zoom: polyView(camera, shot, w, h) };
    onApply?.();
  }

  /** Apply a camera description; what it does not name comes from `CAMERA`. */
  function frameTo(next) {
    described = next ?? {};
    applyCamera();
  }

  /**
   * The hand-moved view in force — or, when nobody has touched the camera, the one
   * that changes nothing, which is where a first gesture starts from.
   */
  function currentView() {
    if (view) return view;
    const base = { ...CAMERA, ...described };
    return { rotX: Number(base['rot-x']), rotY: Number(base['rot-y']), zoomBy: 1, offset: [0, 0, 0] };
  }

  /** Put a hand-moved view on the camera. */
  function adjust(next) {
    view = next;
    applyCamera();
  }

  return { frameTo, applyCamera, view: currentView, adjust, applied: () => applied };
}
