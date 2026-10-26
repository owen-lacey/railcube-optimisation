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
import { growEase } from '../grow.js';

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

// The viewer's own buttons, in its right-hand corners. Unlike a box a host lays
// over the viewer, a button is cleared by the shot's own frame — the reference
// 9:7 it is described in, at the margin — not by the region around it: the frame
// slides the way it has room to, and is drawn smaller only if that is not enough.
// On a region wider than the frame that is to the left, beside them; on a
// narrower one, up or down, past them.
const BUTTONS = new Set(['top-right', 'bottom-right']);
const RATIO = REFERENCE_WIDTH / REFERENCE_HEIGHT;

/**
 * The part of a `width`×`height` viewer a shot is framed in, `{ left, top, width,
 * height }` in CSS pixels: all of it, or the part clear of `boxes`, things laid
 * over it — `{ edge, width, height }` each, one to an edge. A box in the top left
 * is cleared by the band beside it or the band under it; a box along the bottom
 * (`edge` 'bottom', its `height` measured up from that edge) by the band above it.
 * A button in a right-hand corner ('top-right', 'bottom-right') is cleared by the
 * shot's frame standing beside it or past it. `choice` says which, for the
 * top-left box and for the buttons: by default `bandFor`'s.
 */
export function freeRegion(width, height, boxes = [], choice = bandFor(width, height, boxes)) {
  let [left, top, bottom] = [0, 0, height];
  const under = choice['top-left'] === 'under';
  for (const box of boxes) {
    if (box.edge === 'bottom') bottom = Math.min(bottom, height - box.height);
    if (box.edge === 'top-left' && under) top = Math.max(top, box.height);
    if (box.edge === 'top-left' && !under) left = Math.max(left, box.width);
  }
  const region = { left, top, width: width - left, height: bottom - top };
  return clearOfButtons(region, boxes.filter(box => BUTTONS.has(box.edge)), choice, width, height);
}

const nearest = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * `region` moved and, if it must be, drawn smaller, so that the frame a shot in it
 * is described in reaches none of `buttons`: the largest frame that fits beside or
 * past each, as `choice` says, as near the region's middle as it can be.
 */
function clearOfButtons(region, buttons, choice, width, height) {
  const frameW = Math.min(region.width, region.height * RATIO) * MARGIN;
  const frameH = frameW / RATIO;
  let [left, right, top, bottom] = [region.left, region.left + region.width, region.top, region.top + region.height];
  for (const box of buttons) {
    if (choice.buttons !== 'past') right = Math.min(right, width - box.width);
    else if (box.edge === 'top-right') top = Math.max(top, box.height);
    else bottom = Math.min(bottom, height - box.height);
  }
  const scale = Math.max(0, Math.min(1, (right - left) / frameW, (bottom - top) / frameH));
  const [halfW, halfH] = [scale * frameW / 2, scale * frameH / 2];
  const cx = nearest(region.left + region.width / 2, left + halfW, right - halfW);
  const cy = nearest(region.top + region.height / 2, top + halfH, bottom - halfH);
  const [w, h] = [region.width * scale, region.height * scale];
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

/**
 * How `freeRegion` clears the boxes when not told, `{ 'top-left': 'beside' |
 * 'under', buttons: 'beside' | 'past' }`: the top-left box by whichever band draws
 * a shot larger, beside winning a tie; the buttons the way the frame has room to
 * slide in what that leaves.
 */
export function bandFor(width, height, boxes = []) {
  // Only what is there is chosen for: a box that arrives is not a change of mind.
  const top = boxes.find(box => box.edge === 'top-left');
  const buttons = boxes.some(box => BUTTONS.has(box.edge));
  const bottom = boxes.find(box => box.edge === 'bottom')?.height ?? 0;
  const choices = (top ? ['beside', 'under'] : [null]).map(side => {
    const across = side === 'beside' ? width - top.width : width;
    const down = height - bottom - (side === 'under' ? top.height : 0);
    return {
      ...(side && { 'top-left': side }),
      ...(buttons && { buttons: across / down > RATIO ? 'beside' : 'past' }),
    };
  });
  const fit = choice => {
    const region = freeRegion(width, height, boxes, choice);
    return Math.min(region.width, region.height * RATIO);
  };
  return choices.reduce((best, choice) => (fit(choice) > fit(best) + 1e-9 ? choice : best));
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
 * still off the picture. Where a piece arriving from off-screen sets off. `region`
 * is the part of the viewer the shot is framed in — see `freeRegion`.
 */
export function offscreen(position, description, width, height, margin, region = freeRegion(width, height)) {
  const base = { ...CAMERA, ...description };
  const zoom = appliedZoom(base.zoom, region.width, region.height);
  const { right, up } = screenAxes(base);
  const from = new Vector3(...position).sub(new Vector3(...numbers(base.target)));
  const x = from.dot(right);
  const y = from.dot(up);
  const { left, rightEdge, top, bottom } = edges(width, height, region, zoom);
  const exits = [
    { axis: right, sign: 1, room: rightEdge - x },
    { axis: right, sign: -1, room: left + x },
    { axis: up, sign: 1, room: top - y },
    { axis: up, sign: -1, room: bottom + y },
  ];
  const { axis, sign, room } = exits.reduce((best, exit) => (exit.room < best.room ? exit : best));
  return new Vector3(...position).addScaledVector(axis, sign * (Math.max(room, 0) + margin)).toArray();
}

/**
 * How far the viewer's edges stand from the target, in world units at `zoom`: the
 * target is drawn in the middle of `region`, not necessarily of the viewer.
 */
function edges(width, height, region, zoom) {
  const x = region.left + region.width / 2;
  const y = region.top + region.height / 2;
  return { left: x / zoom, rightEdge: (width - x) / zoom, top: y / zoom, bottom: (height - y) / zoom };
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
 *
 * `region` is the part of the viewer the shot is framed in — see `freeRegion`. The
 * zoom is fitted to it and the target drawn in its middle; the rest of the viewer
 * still draws, past its edges.
 */
export function polyView(camera, description, width, height, region = freeRegion(width, height)) {
  const base = { ...CAMERA, ...description };
  const zoom = appliedZoom(base.zoom, region.width, region.height);
  const { towards, right, up } = screenAxes(base);
  const target = new Vector3(...numbers(base.target));
  camera.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, towards));
  camera.position.copy(target).addScaledVector(towards, DISTANCE);
  const { left, rightEdge, top, bottom } = edges(width, height, region, zoom);
  camera.left = -left;
  camera.right = rightEdge;
  camera.top = top;
  camera.bottom = -bottom;
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
export function createCamera(camera, size, onApply, { onBlend, instant = false } = {}) {
  let described = {};
  let view = null;
  let reserved = [];
  let choice = null;
  // The region last framed in, as shares of the viewer, and — while shots ease from
  // one way of clearing the boxes to another — where the ease set off from, in the
  // same shares, and how much of it is left, 1 to 0.
  let shown = null;
  let leaving = null;

  /**
   * The part of the viewer shots are framed in now: the region clear of the
   * reserved boxes, each `share` of the way to clear of it from not at all — see
   * `freeRegion`. A box part way is cleared as if it were that share of its size.
   *
   * The way each box is cleared is chosen afresh every time, and when the best way
   * changes — a card growing to full screen changes shape as it goes — shots ease
   * over to it rather than jumping (`onBlend` is told, and `stepBlend` moves it
   * on), or go at once when `instant`. An ease sets off from wherever shots are
   * framed, so a change part way through another turns it without a jump. A box
   * new to the choice is not a change.
   */
  function region() {
    const { width, height } = size();
    const [w, h] = [width || REFERENCE_WIDTH, height || REFERENCE_HEIGHT];
    const boxes = reserved.filter(box => box.share > 0)
      .map(({ edge, width: bw, height: bh, share }) => ({ edge, width: bw * share, height: bh * share }));
    choose(bandFor(w, h, boxes));
    const to = freeRegion(w, h, boxes, choice);
    const t = leaving ? growEase(1 - leaving.left) : 1;
    const from = leaving && { left: leaving.from.left * w, top: leaving.from.top * h, width: leaving.from.width * w, height: leaving.from.height * h };
    const now = leaving ? Object.fromEntries(Object.keys(to).map(k => [k, from[k] + (to[k] - from[k]) * t])) : to;
    shown = { left: now.left / w, top: now.top / h, width: now.width / w, height: now.height / h };
    return now;
  }

  /** Take `best` as the way to clear the boxes, easing over to it from where shots are if it is a change. */
  function choose(best) {
    const change = choice && shown && Object.keys(best).some(edge => edge in choice && best[edge] !== choice[edge]);
    if (change && !instant) {
      leaving = { from: shown, left: 1 };
      onBlend?.();
    }
    choice = best;
  }

  /** Move an ease between ways of clearing on by `part` of its length; say if one is still under way. */
  function stepBlend(part) {
    if (!leaving) return false;
    leaving.left = Math.max(0, leaving.left - part);
    if (leaving.left === 0) leaving = null;
    applyCamera();
    return Boolean(leaving);
  }
  let applied = { ...CAMERA, zoom: appliedZoom(CAMERA.zoom, REFERENCE_WIDTH, REFERENCE_HEIGHT) };

  /** (Re-)apply the current description at the viewer's current size. */
  function applyCamera() {
    const { width, height } = size();
    const w = width || REFERENCE_WIDTH;
    const h = height || REFERENCE_HEIGHT;
    const shot = { ...CAMERA, ...adjusted(described, view) };
    applied = { ...shot, zoom: polyView(camera, shot, w, h, region()) };
    onApply?.();
  }

  /**
   * Keep shots clear of boxes laid over the viewer, `{ edge, width, height, share }`
   * each in CSS pixels (see `freeRegion`); none frames them in the whole viewer.
   * `share` (0–1) frames them that share of the way from not clearing the box to
   * clearing it, so a stage can ease between the two.
   */
  function reserve(boxes) {
    reserved = boxes;
    applyCamera();
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

  /**
   * Put a hand-moved view on the camera. One that changes nothing — a tap, a
   * gesture that never moved — leaves the camera untouched.
   */
  function adjust(next) {
    const now = currentView();
    // The turn the same way round: a drag that never moved still writes it in 0–360.
    const turned = (((next.rotY - now.rotY) % 360) + 360) % 360;
    const same = next.rotX === now.rotX && Math.min(turned, 360 - turned) < 1e-9 && next.zoomBy === now.zoomBy
      && next.offset.every((v, a) => v === now.offset[a]);
    if (same) return;
    view = next;
    applyCamera();
  }

  /** Take the hand off the camera, back to the shot as described. */
  function reset() {
    view = null;
    applyCamera();
  }

  return {
    frameTo, applyCamera, reserve, region, stepBlend, view: currentView, untouched, adjust, reset, touched: () => view !== null,
    applied: () => applied,
  };
}
