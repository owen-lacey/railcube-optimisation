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
  adjusted, appliedZoom, bandFor, createCamera, freeRegion, polyView, offscreen, CAMERA, REFERENCE_WIDTH, REFERENCE_HEIGHT,
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

  // A tap is a gesture that never moved: it leaves the camera untouched.
  camera.adjust({ ...start, offset: [...start.offset] });
  assert.equal(camera.touched(), false, 'a view that changes nothing is no touch');
  camera.adjust(orbit(start, 0, 0));
  assert.equal(camera.touched(), false, 'nor is a drag that never moved, its turn written in 0–360');

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
  assert.deepEqual(freeRegion(360, 225, [{ edge: 'top-left', width: 180, height: 110 }]), { left: 180, top: 0, width: 180, height: 225 });
  // A wide, tall card: under it does.
  assert.deepEqual(freeRegion(400, 600, [{ edge: 'top-left', width: 180, height: 110 }]), { left: 0, top: 110, width: 400, height: 490 });
  assert.deepEqual(freeRegion(360, 225, []), { left: 0, top: 0, width: 360, height: 225 });
});

test('a reserved bottom edge frames the shot above it, whatever fits larger', () => {
  assert.deepEqual(freeRegion(360, 225, [{ edge: 'bottom', width: 300, height: 60 }]), { left: 0, top: 0, width: 360, height: 165 });
});

// The frame a shot in `region` is described in: the reference 9:7, at the margin.
function frameOf(region) {
  const fit = Math.min(region.width, region.height * REFERENCE_WIDTH / REFERENCE_HEIGHT) * 0.88;
  const [w, h] = [fit, fit * REFERENCE_HEIGHT / REFERENCE_WIDTH];
  const [cx, cy] = [region.left + region.width / 2, region.top + region.height / 2];
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
}

// A button's box on screen, in a `width`×`height` viewer.
const buttonAt = (box, width, height) => ({
  left: width - box.width,
  right: width,
  top: box.edge === 'top-right' ? 0 : height - box.height,
  bottom: box.edge === 'top-right' ? box.height : height,
});

const overlaps = (a, b) => a.left < b.right - 1e-9 && b.left < a.right - 1e-9 && a.top < b.bottom - 1e-9 && b.top < a.bottom - 1e-9;

// Clear of a button the given way: to its left, or below or above it.
const clearBy = (way, f, b, edge) => (way === 'beside' ? f.right <= b.left + 1e-9 : edge === 'top-right' ? f.top >= b.bottom - 1e-9 : f.bottom <= b.top + 1e-9);

const inside = (a, width, height) => a.left >= -1e-9 && a.top >= -1e-9 && a.right <= width + 1e-9 && a.bottom <= height + 1e-9;

test('buttons in the right-hand corners move a shot\'s frame clear of them, and shrink it only if they must', () => {
  const toolbar = { edge: 'top-right', width: 96, height: 52 };
  const hand = { edge: 'bottom-right', width: 52, height: 52 };
  for (const [width, height] of [[346, 346], [346, 216], [604, 403], [604, 378], [1252, 798], [346, 394], [300, 600], [900, 300], [200, 140]]) {
    for (const buttons of [[toolbar], [hand], [toolbar, hand]]) {
      const label = `${width}x${height} ${buttons.map(b => b.edge)}`;
      const region = freeRegion(width, height, buttons);
      const way = bandFor(width, height, buttons).buttons;
      const frame = frameOf(region);
      assert.ok(inside(frame, width, height), `${label}: the frame stays in the viewer`);
      for (const box of buttons) assert.ok(!overlaps(frame, buttonAt(box, width, height)), `${label}: clear of ${box.edge}`);
      // Beside the buttons on a card wider than the frame, past them on a narrower one.
      assert.equal(way, width / height > REFERENCE_WIDTH / REFERENCE_HEIGHT ? 'beside' : 'past', `${label}: the way it has room`);
      // No smaller than it must be: grown at all, wherever it stands clear that way,
      // it would leave the viewer or reach a button.
      const scale = region.width / width;
      if (scale < 1) {
        const bigger = { width: width * (scale + 0.01), height: height * (scale + 0.01) };
        // Every place the bigger frame could stand in the viewer, 40 steps each way.
        const size = frameOf({ left: 0, top: 0, ...bigger });
        const [fw, fh] = [size.right - size.left, size.bottom - size.top];
        const steps = Array.from({ length: 41 }, (_, i) => i / 40);
        const fits = steps.some(u => steps.some(v => {
          const f = { left: u * (width - fw), top: v * (height - fh) };
          Object.assign(f, { right: f.left + fw, bottom: f.top + fh });
          return inside(f, width, height) && buttons.every(box => clearBy(way, f, buttonAt(box, width, height), box.edge));
        }));
        assert.ok(!fits, `${label}: shrunk to ${scale.toFixed(3)} when a larger frame fits`);
      }
    }
  }
  // Too small to slide clear: drawn smaller.
  assert.ok(freeRegion(200, 140, [toolbar, hand]).width < 200);
  // A phone's 16:10 card: the toolbar is cleared by sliding the frame left, at full size.
  const slid = freeRegion(346, 216, [toolbar, hand]);
  assert.equal(slid.width, 346, 'not drawn smaller');
  assert.ok(slid.left < 0, 'moved left, clear of the toolbar');
  // A phone's square card: the frame reaches neither corner, so nothing moves.
  assert.deepEqual(freeRegion(346, 346, [toolbar, hand]), { left: 0, top: 0, width: 346, height: 346 });
});

test('a top-left box is cleared beside or under it, and the buttons within what is left', () => {
  const left = { edge: 'top-left', width: 180, height: 110 };
  const toolbar = { edge: 'top-right', width: 96, height: 52 };
  assert.equal(bandFor(900, 300, [left, toolbar])['top-left'], 'beside');
  assert.equal(bandFor(400, 700, [left, toolbar])['top-left'], 'under');
  const region = freeRegion(900, 300, [left, toolbar]);
  assert.ok(region.left >= 180, 'beside the box');
  assert.ok(!overlaps(frameOf(region), buttonAt(toolbar, 900, 300)), 'clear of the toolbar');
});

test('a bottom dock is cleared above it, and the buttons within what is left', () => {
  const dock = { edge: 'bottom', width: 600, height: 80 };
  const toolbar = { edge: 'top-right', width: 96, height: 52 };
  const region = freeRegion(600, 400, [dock, toolbar]);
  assert.ok(region.top + region.height <= 320 + 1e-9, 'above the dock');
  assert.ok(!overlaps(frameOf(region), buttonAt(toolbar, 600, 400)), 'clear of the toolbar');
});

test('a shot framed in a region has its target in the middle of it, at the region\'s zoom', () => {
  const [width, height] = [360, 225];
  const region = freeRegion(width, height, [{ edge: 'top-left', width: 180, height: 110 }]);
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
  const region = freeRegion(width, height, [{ edge: 'top-left', width: 180, height: 110 }]);
  const description = { 'rot-x': 65, 'rot-y': -45, zoom: 3, target: '0,0,0' };
  const camera = new OrthographicCamera();
  polyView(camera, description, width, height, region);
  for (const point of [[0, 0, 0], [3, 0, 0], [-3, 2, 1], [0, 0, 5]]) {
    const start = new Vector3(...offscreen(point, description, width, height, 1, region)).project(camera);
    assert.ok(Math.abs(start.x) > 1 || Math.abs(start.y) > 1, `${point} starts on screen`);
  }
});

test('when the best way of clearing a box changes, the shot eases over to it', () => {
  // A card growing to full screen on a phone: beside the box fits better at the
  // start, under it by the end, and a band flipping at once jumps the track.
  const size = { width: 360, height: 225 };
  let blends = 0;
  const camera = createCamera(new OrthographicCamera(), () => size, undefined, { onBlend: () => blends++ });
  const box = { edge: 'top-left', width: 180, height: 110 };
  camera.reserve([{ ...box, share: 1 }]);
  assert.equal(camera.region().left, 180, 'beside the box, to begin with');
  assert.equal(blends, 0, 'the first choice is taken, not eased to');
  Object.assign(size, { width: 360, height: 700 });
  const beside = { left: 180, top: 0, width: 180, height: 700 };
  const under = { left: 0, top: 110, width: 360, height: 590 };
  assert.deepEqual(camera.region(), beside, 'still beside it as the ease sets off');
  assert.equal(blends, 1, 'the stage is told to run the ease');
  camera.stepBlend(0.5);
  const midway = camera.region();
  assert.ok(midway.left < 180 && midway.left > 0 && midway.top > 0 && midway.top < 110, `part way: ${JSON.stringify(midway)}`);
  assert.equal(camera.stepBlend(0.5), false, 'done');
  assert.deepEqual(camera.region(), under, 'under it once there');
  assert.equal(blends, 1);
});

test('a change of mind part way through an ease turns it from where it got to', () => {
  const size = { width: 360, height: 225 };
  let blends = 0;
  const camera = createCamera(new OrthographicCamera(), () => size, undefined, { onBlend: () => blends++ });
  camera.reserve([{ edge: 'top-left', width: 180, height: 110, share: 1 }]);
  camera.region();
  Object.assign(size, { width: 360, height: 700 });
  camera.region();
  camera.stepBlend(0.25);
  const at = camera.region();
  // Back at the old shape, beside the box is best again: it turns from where it is.
  Object.assign(size, { width: 360, height: 225 });
  const turned = camera.region();
  assert.equal(blends, 2, 'a second ease');
  const share = r => [r.left / size.width, r.top / size.height, r.width / size.width, r.height / size.height];
  const was = [at.left / 360, at.top / 700, at.width / 360, at.height / 700];
  share(turned).forEach((v, i) => assert.ok(Math.abs(v - was[i]) < 1e-9, 'no jump'));
  camera.stepBlend(1);
  assert.equal(camera.region().left, 180, 'beside it again once back');
});

test('under reduced motion a new way of clearing is taken at once', () => {
  const size = { width: 360, height: 225 };
  const camera = createCamera(new OrthographicCamera(), () => size, undefined, { instant: true });
  camera.reserve([{ edge: 'top-left', width: 180, height: 110, share: 1 }]);
  camera.region();
  Object.assign(size, { width: 360, height: 700 });
  assert.deepEqual(camera.region(), { left: 0, top: 110, width: 360, height: 590 });
});
