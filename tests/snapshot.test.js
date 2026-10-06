// The square-on snapshot: a viewer sized to a layout's outline from one face of its
// box, framed on it at an exact scale. "The picture is clipped to exactly the
// cubes" is a claim about where the outline lands on screen, so it is checked by projecting through a
// real three.js camera set up by `polyView`, as controls.test.js does for a pan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { appliedZoom, describedZoom, polyView } from '../site/src/lib/render/camera.js';
import { squareOn, boundsOf, VIEWS } from '../site/src/lib/scenes.js';
import { toWorld } from '../site/src/lib/render/vec.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

test('describedZoom undoes appliedZoom', () => {
  for (const [w, h] of [[900, 700], [120, 600], [1400, 200]]) {
    for (const p of [0.5, 3, 10]) near(appliedZoom(describedZoom(p, w, h), w, h), p, `${w}×${h} at ${p}`);
  }
});

// Open, closed, and one that climbs a wall.
const SHAPES = ['SSSSRRSSSS', 'LLLL', 'LIRIROSOLORLLSORII', 'SSOSS'];

const TURNS = [0, 90, 180, 270];

// Which way screen right and screen up point, unrolled, in cells — written down
// from where each camera stands rather than read off `VIEWS`.
const SCREEN = {
  above: { right: [1, 0, 0], up: [0, 0, 1] },
  below: { right: [1, 0, 0], up: [0, 0, -1] },
  front: { right: [1, 0, 0], up: [0, 1, 0] },
  behind: { right: [-1, 0, 0], up: [0, 1, 0] },
  left: { right: [0, 0, -1], up: [0, 1, 0] },
  right: { right: [0, 0, 1], up: [0, 1, 0] },
};

test('every face is checked', () => {
  assert.deepEqual(Object.keys(SCREEN).sort(), Object.keys(VIEWS).sort());
});

test('the viewer is the outline, cells times perCube', () => {
  for (const shape of SHAPES) {
    for (const face of Object.keys(VIEWS)) {
      for (const turn of TURNS) {
        const { pieces, width, height } = squareOn(shape, { perCube: 60, view: face, turn });
        const { lo, hi } = boundsOf(pieces);
        const span = v => v.reduce((sum, d, a) => sum + Math.abs(d) * (hi[a] - lo[a] + 1), 0) * 60;
        const [across, along] = [span(SCREEN[face].right), span(SCREEN[face].up)];
        assert.deepEqual([width, height], turn % 180 === 0 ? [across, along] : [along, across], `${shape} ${face} ${turn}`);
      }
    }
  }
});

test('a turn that is not a quarter is refused', () => {
  assert.throws(() => squareOn('LLLL', { turn: 45 }), /quarter/);
});

test('the outline fills the canvas, with each direction where the face and turn put it', () => {
  for (const shape of SHAPES) {
    for (const face of Object.keys(VIEWS)) {
      for (const turn of TURNS) {
        const { pieces, camera: shot, width, height } = squareOn(shape, { perCube: 60, view: face, turn });
        const { lo, hi } = boundsOf(pieces);
        const camera = new OrthographicCamera();
        polyView(camera, shot, width, height);
        const ndc = cell => new Vector3(...toWorld(cell)).project(camera);
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(k => ndc([0, 1, 2].map(a => ((k >> a) & 1 ? hi[a] + 0.5 : lo[a] - 0.5))));
        const label = `${shape} ${face} ${turn}`;
        for (const axis of ['x', 'y']) {
          near(Math.min(...corners.map(c => c[axis])), -1, `${label} low ${axis}`);
          near(Math.max(...corners.map(c => c[axis])), 1, `${label} high ${axis}`);
        }
        // A clockwise turn of the picture: what was up goes towards the right.
        const t = turn * Math.PI / 180;
        const centre = ndc([0, 0, 0]);
        const towards = (v, [x, y]) => {
          const at = ndc(v);
          const [dx, dy] = [(at.x - centre.x) * width, (at.y - centre.y) * height];
          const length = Math.hypot(dx, dy);
          near(dx / length, x, `${label} ${v} across`);
          near(dy / length, y, `${label} ${v} up`);
        };
        towards(SCREEN[face].right, [Math.cos(t), -Math.sin(t)]);
        towards(SCREEN[face].up, [Math.sin(t), Math.cos(t)]);
      }
    }
  }
});
