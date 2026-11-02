// A viewer you can handle: drag to turn it, pinch or scroll to zoom, two fingers
// (or a right- or shift-drag) to slide it about. The keys do it too, while the
// viewer has focus: + and − zoom, and the arrows turn and tilt it — except in a
// builder, whose arrows lay pieces, so there only + and − (see `attachBuilderControls`).
// The viewer's own buttons step it the same way (`STEPS`).
//
// The gestures come from `@use-gesture`, and what they do goes through
// `stage.adjust` as a hand-moved *view* composed on top of whatever the stage has
// described (see `adjusted` in camera.js). The stage can go on framing and panning
// as it likes, and the turn, the zoom and the pan are kept through all of it.

import { Gesture } from '@use-gesture/vanilla';

// A quarter of a degree per pixel, and a tilt from straight down (0) to not quite
// side-on (89).
const DEGREES_PER_PIXEL = 0.25;
const TILT = [0, 89];
// How far the view can be zoomed away from the frame the stage chose.
export const ZOOM_BY = [0.25, 6];
// A wheel notch is about 100 in `deltaY`, so this is roughly 20% a notch.
const WHEEL = 0.002;

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
const rad = d => d * Math.PI / 180;

/** The view turned by a drag of `dx, dy` pixels. */
export const orbit = (view, dx, dy) => ({
  ...view,
  rotX: clamp(view.rotX - dy * DEGREES_PER_PIXEL, TILT),
  rotY: (((view.rotY - dx * DEGREES_PER_PIXEL) % 360) + 360) % 360,
});

/** The view zoomed to `zoomBy` times the frame, within bounds. */
export const zoomed = (view, zoomBy) => ({ ...view, zoomBy: clamp(zoomBy, ZOOM_BY) });

/**
 * The view slid by `dx, dy` pixels, so that the scene follows the pointer — a
 * point on the ground under the finger stays under it.
 *
 * The slide is along the ground rather than across the screen, so what the view
 * turns about stays at the height it was; `zoom` is the zoom actually applied to
 * the camera, which is what turns pixels into world units. The arithmetic is the
 * camera `polyView` sets up, inverted, and `tests/controls.test.js` checks it by
 * projecting through a real three camera rather than against this comment.
 *
 * Near side-on the ground is foreshortened to nothing, and a pixel of vertical
 * drag would be a very long way, so the cosine is floored.
 */
export function slid(view, dx, dy, zoom) {
  const c = Math.cos(rad(view.rotY));
  const s = Math.sin(rad(view.rotY));
  const q = Math.max(0.1, Math.cos(rad(view.rotX)));
  const [x, y, z] = view.offset;
  return {
    ...view,
    offset: [x + (dx * s - (dy * c) / q) / zoom, y - (dx * c + (dy * s) / q) / zoom, z],
  };
}

// One step of a button or a key: a turn of 15 degrees, as a drag of that many
// degrees' pixels, or a zoom by a quarter.
const TURN_STEP = 15 / DEGREES_PER_PIXEL;
const ZOOM_STEP = 1.25;

/** What each of the viewer's buttons and keys does to the view, by name. */
export const STEPS = {
  zoomIn: view => zoomed(view, view.zoomBy * ZOOM_STEP),
  zoomOut: view => zoomed(view, view.zoomBy / ZOOM_STEP),
  turnLeft: view => orbit(view, -TURN_STEP, 0),
  turnRight: view => orbit(view, TURN_STEP, 0),
  tiltUp: view => orbit(view, 0, -TURN_STEP),
  tiltDown: view => orbit(view, 0, TURN_STEP),
};

// The keys, by `event.key`: + and − (with or without shift), and the arrows.
const ZOOM_KEYS = { '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '_': 'zoomOut' };
const ARROW_KEYS = { ArrowLeft: 'turnLeft', ArrowRight: 'turnRight', ArrowUp: 'tiltUp', ArrowDown: 'tiltDown' };

/**
 * The step a key asks for, by name, or null: a modified key is never one, and the
 * arrows are one only when `arrows`.
 */
export function keyStep(event, { arrows = true } = {}) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return ZOOM_KEYS[event.key] ?? (arrows ? ARROW_KEYS[event.key] : undefined) ?? null;
}

/**
 * Let a viewer be handled. `host` is what the gestures are read off, and it takes
 * focus and the keys while handled; a pan is measured in the stage's applied zoom.
 * `arrows` says whether the arrows turn it.
 */
export function attachControls(host, stage, { arrows = true } = {}) {
  const appliedZoom = () => stage.zoom();

  const gesture = new Gesture(host, {
    onDrag({ delta: [dx, dy], pinching, cancel, buttons, shiftKey }) {
      // Two fingers are the pinch's, which pans as well as zooms.
      if (pinching) return cancel();
      const view = stage.view();
      stage.adjust(shiftKey || buttons & 2 ? slid(view, dx, dy, appliedZoom()) : orbit(view, dx, dy));
    },
    onPinch({ offset: [scale], origin, memo }) {
      stage.adjust(zoomed(stage.view(), scale));
      // The pinch's midpoint moving is the two-finger pan. A trackpad pinch
      // arrives as a wheel with its midpoint pinned to the pointer, so it never pans.
      if (memo) {
        stage.adjust(slid(stage.view(), origin[0] - memo[0], origin[1] - memo[1], appliedZoom()));
      }
      return origin;
    },
    onWheel({ event, delta: [, dy] }) {
      // A trackpad pinch is a wheel with ctrl held, and it is the pinch's.
      if (event.ctrlKey) return;
      event.preventDefault();
      const view = stage.view();
      stage.adjust(zoomed(view, view.zoomBy * Math.exp(-dy * WHEEL)));
    },
  }, {
    drag: { pointer: { buttons: [1, 2] } },
    // Where a pinch starts from is the zoom the view is at, whatever last set it.
    pinch: { from: () => [stage.view().zoomBy, 0], scaleBounds: { min: ZOOM_BY[0], max: ZOOM_BY[1] } },
    wheel: { eventOptions: { passive: false } },
  });

  // A right-drag is a pan, not a request for the context menu.
  const noMenu = event => event.preventDefault();
  host.addEventListener('contextmenu', noMenu);

  // A key something inside the viewer has already used (a tile's arrows) is not one.
  const onKey = event => {
    const step = !event.defaultPrevented && keyStep(event, { arrows });
    if (!step) return;
    event.preventDefault();
    stage.nudge(STEPS[step]);
  };
  host.addEventListener('keydown', onKey);
  host.tabIndex = 0;
  host.setAttribute('aria-keyshortcuts', arrows ? '+ - ArrowLeft ArrowRight ArrowUp ArrowDown' : '+ -');

  return {
    destroy() {
      gesture.destroy();
      host.removeEventListener('contextmenu', noMenu);
      host.removeEventListener('keydown', onKey);
      host.removeAttribute('tabindex');
      host.removeAttribute('aria-keyshortcuts');
    },
  };
}

/** `attachControls` for a builder, whose arrows lay pieces: + and − only. */
export const attachBuilderControls = (host, stage) => attachControls(host, stage, { arrows: false });
