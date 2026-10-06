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
 * A view part-way from `from` to `to`, at `t` in 0..1: the turn the short way
 * round, the zoom by equal ratios rather than equal steps, the tilt and the pan
 * straight.
 */
export function viewBetween(from, to, t) {
  const turn = ((((to.rotY - from.rotY) % 360) + 540) % 360) - 180;
  return {
    rotX: from.rotX + (to.rotX - from.rotX) * t,
    rotY: from.rotY + turn * t,
    zoomBy: from.zoomBy * (to.zoomBy / from.zoomBy) ** t,
    offset: from.offset.map((v, a) => v + (to.offset[a] - v) * t),
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
 * `appliedZoom` the other way round: the description zoom that comes to
 * `pixelsPerUnit` at this viewer size. For a shot that must be an exact scale,
 * which the margin would otherwise shrink.
 */
export function describedZoom(pixelsPerUnit, width, height) {
  const fit = Math.min(width, height * (REFERENCE_WIDTH / REFERENCE_HEIGHT));
  return pixelsPerUnit / ((fit / REFERENCE_WIDTH) * MARGIN);
}

/**
 * The screen's axes in the world for a description's tilt, turn and roll: `towards`
 * the viewer, and `right` and `up` the screen. See `polyView`.
 */
export function screenAxes(description) {
  const base = { ...CAMERA, ...description };
  const tilt = rad(Number(base['rot-x']));
  const turn = rad(Number(base['rot-y']));
  const towards = new Vector3(Math.sin(tilt) * Math.cos(turn), Math.sin(tilt) * Math.sin(turn), Math.cos(tilt));
  const right = new Vector3(-Math.sin(turn), Math.cos(turn), 0);
  const level = new Vector3().crossVectors(towards, right);
  const roll = rad(Number(base.roll ?? 0));
  const up = level.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));
  right.multiplyScalar(Math.cos(roll)).addScaledVector(level, Math.sin(roll));
  return { towards, right, up };
}

/**
 * A description that draws the world point `target`, `[x, y, z]`, at `at`, `[x, y]`
 * CSS pixels from a `width`×`height` viewer's top left, at `perUnit` CSS pixels a
 * world unit, from these angles. A described shot always puts its target in the
 * middle; this one is moved so the middle is wherever puts `target` at `at`.
 */
export function pinnedShot({ target, perUnit, at, ...angles }, width, height) {
  const { right, up } = screenAxes(angles);
  const [dx, dy] = [at[0] - width / 2, at[1] - height / 2];
  const middle = new Vector3(...target).addScaledVector(right, -dx / perUnit).addScaledVector(up, dy / perUnit);
  return { ...angles, target: middle.toArray().join(','), zoom: describedZoom(perUnit, width, height) };
}

/**
 * A world point beyond the nearest edge of a description's frame from `position`:
 * where `position` lands on a `width`×`height` viewer, pushed straight out through
 * whichever edge is closest, far enough that `margin` world units round it are
 * still off the picture. Where a piece arriving from off-screen sets off.
 */
export function offscreen(position, description, width, height, margin) {
  const base = { ...CAMERA, ...description };
  const zoom = appliedZoom(base.zoom, width, height);
  const { right, up } = screenAxes(base);
  const from = new Vector3(...position).sub(new Vector3(...numbers(base.target)));
  const x = from.dot(right);
  const y = from.dot(up);
  const [halfW, halfH] = [width / 2 / zoom, height / 2 / zoom];
  const exits = [
    { axis: right, sign: 1, room: halfW - x },
    { axis: right, sign: -1, room: halfW + x },
    { axis: up, sign: 1, room: halfH - y },
    { axis: up, sign: -1, room: halfH + y },
  ];
  const { axis, sign, room } = exits.reduce((best, exit) => (exit.room < best.room ? exit : best));
  return new Vector3(...position).addScaledVector(axis, sign * (Math.max(room, 0) + margin)).toArray();
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
 *
 * `roll`, if the description has one, then turns the picture clockwise by that
 * many degrees about the line of sight. Tilt and turn alone keep screen right level, so a shot from the side can
 * never have up anywhere but up the screen; the roll is what can.
 */
export function polyView(camera, description, width, height) {
  const base = { ...CAMERA, ...description };
  const zoom = appliedZoom(base.zoom, width, height);
  const { towards, right, up } = screenAxes(base);
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

  /** The view that changes nothing: the description's own shot. */
  function untouched() {
    const base = { ...CAMERA, ...described };
    return { rotX: Number(base['rot-x']), rotY: Number(base['rot-y']), zoomBy: 1, offset: [0, 0, 0] };
  }

  /**
   * The hand-moved view in force — or, when nobody has touched the camera, the one
   * that changes nothing, which is where a first gesture starts from.
   */
  const currentView = () => view ?? untouched();

  /** Put a hand-moved view on the camera. */
  function adjust(next) {
    view = next;
    applyCamera();
  }

  /** Take the hand off the camera, back to the shot as described. */
  function reset() {
    view = null;
    applyCamera();
  }

  return {
    frameTo, applyCamera, view: currentView, untouched, adjust, reset, touched: () => view !== null, applied: () => applied,
  };
}
