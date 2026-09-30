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

import { WebGLRenderer } from 'three';

let renderer = null;
let width = 0;
let height = 0;

const pixelRatio = () => Math.min(globalThis.devicePixelRatio ?? 1, 3);

/** The shared renderer, at least `w`×`h` CSS pixels at the current pixel ratio. */
function fitted(w, h) {
  renderer ??= new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
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
 * The overlay paint, read off the viewer's stylesheet so the theme stays in CSS:
 * the lattice's colour and strength, and the ghost trains' two tints.
 */
export function readTheme(el) {
  const style = getComputedStyle(el);
  const value = name => style.getPropertyValue(name).trim();
  return {
    grid: value('--grid-color'),
    gridOpacity: Number(value('--grid-opacity')),
    ghostBefore: value('--ghost-before'),
    ghostAfter: value('--ghost-after'),
    ghostOpacity: Number(value('--ghost-opacity')),
  };
}
