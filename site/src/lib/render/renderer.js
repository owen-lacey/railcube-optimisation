// The one WebGL renderer every viewer on a page is drawn through.
//
// Browsers cap a page at about sixteen WebGL contexts, and a blog post is more
// viewers than that, so no viewer owns one. There is a single offscreen
// `WebGLRenderer`, grown to the largest viewer, and each viewer is a plain 2D
// canvas the render is copied into with `drawImage`. Measured on a phone in the
// first three.js spike: the post's thirteen viewers held frame rate at pixel ratio
// 3 with antialiasing, three 36-cube tracks lapping at once.
//
// It is made on first use rather than at import, because every page here is
// prerendered and there is no WebGL in Node.
//
// It only ever grows by itself, since a smaller viewer fits in a bigger buffer and
// a resize reallocates it. Two things are therefore said to it from outside: a
// viewer about to grow to a known size every frame on the way (a card opening full
// screen) reserves that size at once, so the buffer is reallocated once rather
// than every frame; and once a picture bigger than any viewer has gone (the
// title's full-screen zoom, a card closing full screen), it is released, and
// grows back to only what the viewers then draw.

import { WebGLRenderer } from 'three';

let renderer = null;
let width = 0;
let height = 0;

const pixelRatio = () => Math.min(globalThis.devicePixelRatio ?? 1, 3);

/** The shared renderer, at least `w`×`h` CSS pixels at the current pixel ratio. */
function fitted(w, h) {
  renderer ??= new WebGLRenderer({ alpha: true, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  const ratio = pixelRatio();
  if (w <= width && h <= height && renderer.getPixelRatio() === ratio) return renderer;
  width = Math.max(width, w);
  height = Math.max(height, h);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  return renderer;
}

/**
 * Render `scene` through `camera` and copy it onto `canvas`, `w`×`h` CSS pixels.
 *
 * The copy has to happen in the same task as the render: left for later, the
 * source can read back blank.
 */
function draw(canvas, scene, camera, w, h) {
  const gl = fitted(w, h);
  const ratio = gl.getPixelRatio();
  const pw = Math.round(w * ratio);
  const ph = Math.round(h * ratio);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  gl.setViewport(0, 0, w, h);
  gl.setScissor(0, 0, w, h);
  gl.clear();
  gl.render(scene, camera);
  const source = gl.domElement;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, pw, ph);
  // The viewport sits at the bottom left of the buffer, and a canvas counts rows from the top.
  context.drawImage(source, 0, source.height - ph, pw, ph, 0, 0, pw, ph);
}

export const sharedRenderer = { draw };

/**
 * Grow the shared renderer to at least `w`×`h` CSS pixels now, for a viewer about
 * to grow towards that size. Before anything has drawn there is nothing to grow.
 */
export function reserveRenderer(w, h) {
  if (renderer) fitted(w, h);
}

/** Let the shared renderer shrink to what the viewers draw next. */
export function releaseRenderer() {
  width = 0;
  height = 0;
}

/**
 * The overlay paint, read off the viewer's stylesheet so the theme stays in CSS:
 * the lattice's colour and strength, and the outline of a step's start.
 */
export function readTheme(el) {
  const style = getComputedStyle(el);
  const value = name => style.getPropertyValue(name).trim();
  return {
    grid: value('--grid-color'),
    gridOpacity: Number(value('--grid-opacity')),
    trainCellOpacity: Number(value('--train-cell-opacity')),
    outlineBefore: value('--outline-before'),
  };
}
