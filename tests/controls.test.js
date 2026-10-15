// The hand-moved camera: what a gesture does to the view, and how that view sits
// on top of whatever the stage has described.
//
// The pan is the part worth pinning. "The scene follows the finger" is a claim
// about the camera, and a wrong sign in it gives a pan that works and goes the
// wrong way, or goes the right way at one angle and slews at every other. So it is
// checked by projecting through a real three.js camera set up by `polyView`, the
// way `rotation.test.js` checks a piece's rotation against a real mesh.
//
// `three` is a runtime dependency and none of this needs a DOM, so it belongs in
// the fast tier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { orbit, zoomed, slid, ZOOM_BY } from '../site/src/lib/render/controls.js';
import {
  adjusted, appliedZoom, createCamera, freeRegion, polyView, offscreen, CAMERA, REFERENCE_WIDTH, REFERENCE_HEIGHT,
} from '../site/src/lib/render/camera.js';

const still = { rotX: 65, rotY: 45, zoomBy: 1, offset: [0, 0, 0] };

/**
 * Where a world point lands on screen, in CSS pixels from the viewer's centre
 * (right and down), through the camera this description puts on a reference-sized
 * viewer. Returns the applied zoom with it, since that is what a pan is measured in.
 */
function project(point, { rotX, rotY, zoom, target }) {
  const camera = new OrthographicCamera();
  const applied = polyView(camera, { 'rot-x': rotX, 'rot-y': rotY, zoom, target: target.join(',') },
    REFERENCE_WIDTH, REFERENCE_HEIGHT);
  const ndc = new Vector3(...point).project(camera);
  return { at: [ndc.x * REFERENCE_WIDTH / 2, -ndc.y * REFERENCE_HEIGHT / 2], applied };
}

test('a pan keeps the point on the ground under the finger', () => {
  const ground = [30, -50, 0];
  for (const rotX of [0, 30, 65, 80]) {
    for (const rotY of [0, 45, 100, 210, 330]) {
      for (const zoom of [0.5, 3.2]) {
        const view = { rotX, rotY, zoomBy: 1, offset: [5, 7, 11] };
        const { at: before, applied } = project(ground, { rotX, rotY, zoom, target: view.offset });
        const [dx, dy] = [23, -41];
        const { at: after } = project(ground, { rotX, rotY, zoom, target: slid(view, dx, dy, applied).offset });
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
  const size = { width: 900, height: 700 };
  const three = new OrthographicCamera();
  const camera = createCamera(three, () => size);
  camera.frameTo({ zoom: 4, target: '0,0,0' });

  const start = camera.view();
  assert.deepEqual(start, { rotX: 65, rotY: -45, zoomBy: 1, offset: [0, 0, 0] }, 'nothing moved yet');
  camera.adjust({ ...start, rotY: 100, zoomBy: 2, offset: [5, 0, 0] });

  camera.frameTo({ zoom: 3, target: '10,0,0' });   // the stage's frame grew
  assert.equal(camera.applied()['rot-y'], 100);
  assert.equal(camera.applied().zoom.toFixed(3), (3 * 2 * 0.88).toFixed(3));
  assert.equal(camera.applied().target, '15,0,0');
  // And the three camera is actually there: one world unit is the applied zoom in pixels.
  assert.equal((size.width / (three.right - three.left)).toFixed(3), (3 * 2 * 0.88).toFixed(3));

  size.width = 450;                                 // half as wide
  camera.applyCamera();
  assert.equal(camera.applied().zoom.toFixed(3), (3 * 2 * 0.5 * 0.88).toFixed(3));
  assert.equal(camera.applied()['rot-y'], 100);
});

test('a reset takes the hand off the camera, back to the shot as described', () => {
  const three = new OrthographicCamera();
  const camera = createCamera(three, () => ({ width: 900, height: 700 }));
  camera.frameTo({ zoom: 4, target: '1,2,3' });
  const untouched = camera.applied();
  const start = camera.view();
  assert.equal(camera.touched(), false, 'nobody has moved it yet');

  camera.adjust({ ...start, rotX: 20, rotY: 100, zoomBy: 2, offset: [5, 0, 0] });
  assert.equal(camera.touched(), true);

  camera.reset();
  assert.equal(camera.touched(), false);
  assert.deepEqual(camera.applied(), untouched);
  assert.deepEqual(camera.view(), start, 'the next gesture starts from the frame again');
});

test('an arrival sets off beyond the edge of the picture nearest where it is going', () => {
  const [halfW, halfH] = [REFERENCE_WIDTH / 2, REFERENCE_HEIGHT / 2];
  for (const rotX of [0, 30, 65, 80]) {
    for (const rotY of [-45, 0, 100, 210]) {
      for (const point of [[10, 20, 5], [-120, 40, 0], [60, -90, 30], [0, 0, 150]]) {
        const shot = { rotX, rotY, zoom: 3, target: [5, -5, 10] };
        const description = { 'rot-x': rotX, 'rot-y': rotY, zoom: 3, target: shot.target.join(',') };
        const { at: [px, py], applied } = project(point, shot);
        const start = offscreen(point, description, REFERENCE_WIDTH, REFERENCE_HEIGHT, 40);
        const { at: [sx, sy] } = project(start, shot);
        const across = halfW - Math.abs(px) < halfH - Math.abs(py);
        const label = `rot ${rotX}/${rotY} from ${point}`;
        // Out through that edge by the margin, and moved along nothing else. A point
        // already past the edge is only moved the margin further.
        if (across) {
          assert.ok(Math.abs(Math.abs(sx) - (Math.max(halfW, Math.abs(px)) + 40 * applied)) < 1e-6 && Math.sign(sx) === Math.sign(px), label);
          assert.ok(Math.abs(sy - py) < 1e-6, label);
        } else {
          assert.ok(Math.abs(Math.abs(sy) - (Math.max(halfH, Math.abs(py)) + 40 * applied)) < 1e-6 && Math.sign(sy) === Math.sign(py), label);
          assert.ok(Math.abs(sx - px) < 1e-6, label);
        }
      }
    }
  }
});

test('a reserved corner frames the shot in the band that fits it larger', () => {
  // A phone-wide 16/10 card: beside the box fits larger than under it.
  assert.deepEqual(freeRegion(360, 225, { width: 180, height: 110 }), { left: 180, top: 0, width: 180, height: 225 });
  // A wide, tall card: under it does.
  assert.deepEqual(freeRegion(400, 600, { width: 180, height: 110 }), { left: 0, top: 110, width: 400, height: 490 });
  assert.deepEqual(freeRegion(360, 225, null), { left: 0, top: 0, width: 360, height: 225 });
});

test('a shot framed in a region has its target in the middle of it, at the region\'s zoom', () => {
  const [width, height] = [360, 225];
  const region = freeRegion(width, height, { width: 180, height: 110 });
  for (const rotX of [0, 65, 90]) {
    for (const rotY of [-45, 100]) {
      const camera = new OrthographicCamera();
      const description = { 'rot-x': rotX, 'rot-y': rotY, zoom: 3, target: '2,-1,4' };
      const zoom = polyView(camera, description, width, height, region);
      assert.equal(zoom, appliedZoom(3, region.width, region.height));
      const ndc = new Vector3(2, -1, 4).project(camera);
      const at = [(ndc.x + 1) / 2 * width, (1 - ndc.y) / 2 * height];
      assert.ok(Math.abs(at[0] - (region.left + region.width / 2)) < 1e-6, `x at ${rotX}/${rotY}`);
      assert.ok(Math.abs(at[1] - (region.top + region.height / 2)) < 1e-6, `y at ${rotX}/${rotY}`);
    }
  }
});

test('a point set off-screen from a region is off the whole viewer', () => {
  const [width, height] = [360, 225];
  const region = freeRegion(width, height, { width: 180, height: 110 });
  const description = { 'rot-x': 65, 'rot-y': -45, zoom: 3, target: '0,0,0' };
  const camera = new OrthographicCamera();
  polyView(camera, description, width, height, region);
  for (const point of [[0, 0, 0], [3, 0, 0], [-3, 2, 1], [0, 0, 5]]) {
    const start = new Vector3(...offscreen(point, description, width, height, 1, region)).project(camera);
    assert.ok(Math.abs(start.x) > 1 || Math.abs(start.y) > 1, `${point} starts on screen`);
  }
});

test('part way to clear of a box, the band holds as the viewer changes shape', () => {
  // A card growing to full screen on a phone: beside the box fits better at the
  // start, under it by the end, and a band flipping mid-ease jumps the track.
  const size = { width: 360, height: 225 };
  const camera = createCamera(new OrthographicCamera(), () => size);
  const box = { width: 180, height: 110 };
  camera.reserve(box, 1);
  assert.equal(camera.region().left, 180, 'beside the box, to begin with');
  Object.assign(size, { width: 360, height: 700 });
  camera.reserve(box, 0.5);
  assert.deepEqual(camera.region(), { left: 90, top: 0, width: 270, height: 700 }, 'still easing from beside it');
  camera.reserve(box, 1);
  assert.deepEqual(camera.region(), { left: 0, top: 110, width: 360, height: 590 }, 'settled, it picks again');
});
