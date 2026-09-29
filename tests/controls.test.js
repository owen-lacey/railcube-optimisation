// The hand-moved camera: what a gesture does to the view, and how that view sits
// on top of whatever the stage has described.
//
// The pan is the part worth pinning. "The scene follows the finger" is a claim
// about PolyCSS's camera transform, and a wrong sign in it gives a pan that works
// and goes the wrong way, or goes the right way at one angle and slews at every
// other. So it is checked against the string `buildPolyCameraSceneTransform`
// actually emits, the way `rotation.test.js` checks a piece's rotation.
//
// `@layoutit/polycss` is a runtime dependency and none of this needs a DOM, so it
// belongs in the fast tier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPolyCameraSceneTransform } from '@layoutit/polycss';
import { orbit, zoomed, slid, ZOOM_BY } from '../site/src/lib/render/controls.js';
import { adjusted, createCamera, CAMERA } from '../site/src/lib/render/camera.js';

const rad = d => d * Math.PI / 180;
const still = { rotX: 65, rotY: 45, zoomBy: 1, offset: [0, 0, 0] };

/**
 * Where a world point lands on screen, in CSS pixels from the camera's centre,
 * read off the transform PolyCSS emits for this camera. CSS transform functions
 * apply right to left to a point, so the parse below is applied in reverse.
 */
function project(point, { rotX, rotY, zoom, target }) {
  const css = buildPolyCameraSceneTransform({ rotX, rotY, zoom, target });
  const steps = [...css.matchAll(/(\w+(?:3d)?)\(([^)]*)\)/g)].map(([, fn, args]) => [fn, args]);
  assert.deepEqual(steps.map(([fn]) => fn), ['scale', 'rotateX', 'rotate', 'translate3d'],
    'PolyCSS has changed the shape of its camera transform');
  let v = [point[1] * 50, point[0] * 50, point[2] * 50];   // the same swap and scale as the target
  for (const [fn, args] of steps.reverse()) {
    const n = args.split(',').map(a => parseFloat(a));
    if (fn === 'translate3d') v = v.map((x, k) => x + n[k]);
    if (fn === 'rotate') {
      const [c, s] = [Math.cos(rad(n[0])), Math.sin(rad(n[0]))];
      v = [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
    }
    if (fn === 'rotateX') {
      const [c, s] = [Math.cos(rad(n[0])), Math.sin(rad(n[0]))];
      v = [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
    }
    if (fn === 'scale') v = v.map(x => x * n[0]);
  }
  return v.slice(0, 2);
}

test('a pan keeps the point on the ground under the finger', () => {
  const ground = [30, -50, 0];
  for (const rotX of [0, 30, 65, 80]) {
    for (const rotY of [0, 45, 100, 210, 330]) {
      for (const zoom of [0.5, 3.2]) {
        const view = { rotX, rotY, zoomBy: 1, offset: [5, 7, 11] };
        const before = project(ground, { rotX, rotY, zoom, target: view.offset });
        const [dx, dy] = [23, -41];
        const after = project(ground, { rotX, rotY, zoom, target: slid(view, dx, dy, zoom).offset });
        assert.ok(Math.abs(after[0] - before[0] - dx) < 1e-9 && Math.abs(after[1] - before[1] - dy) < 1e-9,
          `at tilt ${rotX}, turn ${rotY}, zoom ${zoom} the point moved ${after.map((v, k) => (v - before[k]).toFixed(3))}`);
        assert.equal(slid(view, dx, dy, zoom).offset[2], 11, 'a pan changed the height of the target');
      }
    }
  }
});

test('an orbit turns and tilts, and the tilt stays between straight down and side-on', () => {
  assert.deepEqual(orbit(still, 8, -4), { ...still, rotX: 66, rotY: 43 });
  assert.equal(orbit(still, 0, 1000).rotX, 0);
  assert.equal(orbit(still, 0, -1000).rotX, 89);
  assert.equal(orbit(still, 200, 0).rotY, 355, 'the turn wraps rather than going negative');
});

test('a zoom is bounded', () => {
  assert.equal(zoomed(still, 100).zoomBy, ZOOM_BY[1]);
  assert.equal(zoomed(still, 0.001).zoomBy, ZOOM_BY[0]);
  assert.equal(zoomed(still, 2).zoomBy, 2);
});

test('a view rides on top of the description rather than replacing it', () => {
  const view = { rotX: 30, rotY: 10, zoomBy: 2, offset: [1, 2, 3] };
  assert.deepEqual(adjusted({ zoom: 3, target: '10,20,30' }, view),
    { 'rot-x': 30, 'rot-y': 10, zoom: 6, target: '11,22,33' });
  assert.deepEqual(adjusted({ zoom: 3 }, null), { zoom: 3 }, 'an untouched camera is the description');
  assert.equal(adjusted({}, view).zoom, CAMERA.zoom * 2, 'a view on nothing starts from the markup');
});

test('a hand-moved view survives the stage reframing and the viewer resizing', () => {
  const el = {
    clientWidth: 900,
    clientHeight: 700,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const camera = createCamera(el);
  camera.frameTo({ zoom: 4, target: '0,0,0' });

  const start = camera.view();
  assert.deepEqual(start, { rotX: 65, rotY: -45, zoomBy: 1, offset: [0, 0, 0] }, 'nothing moved yet');
  camera.adjust({ ...start, rotY: 100, zoomBy: 2, offset: [5, 0, 0] });

  camera.frameTo({ zoom: 3, target: '10,0,0' });   // the stage's frame grew
  assert.equal(el.attributes['rot-y'], '100');
  assert.equal(Number(el.attributes.zoom).toFixed(3), (3 * 2 * 0.88).toFixed(3));
  assert.equal(el.attributes.target, '15,0,0');

  el.clientWidth = 450;                             // half as wide
  camera.applyCamera();
  assert.equal(Number(el.attributes.zoom).toFixed(3), (3 * 2 * 0.5 * 0.88).toFixed(3));
  assert.equal(el.attributes['rot-y'], '100');
});
