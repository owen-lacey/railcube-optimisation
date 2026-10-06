// The title's zoom draws its track on a canvas covering the screen, pinned to a box
// that moves and grows, so the picture at each end has to be the picture the O and
// the post's viewer draw. Checked by projecting through real three.js cameras, the
// way controls.test.js checks a pan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { pinnedShot, polyView } from '../site/src/lib/render/camera.js';
import { endOf, shotBetween } from '../site/src/lib/render/zoom.js';
import { squareOn, layoutScene, boundsOf, cornersOf } from '../site/src/lib/scenes.js';
import { O_TRACK, HEIGHT } from '../site/src/lib/letters.js';

const SCREEN = { width: 1280, height: 800 };
const LETTER = { left: 131, top: 97.5, width: 4 * 41.25, height: HEIGHT * 41.25 };
const CARD = { left: 18, top: 14, width: 1240, height: 560 };

/** Where world points land, in CSS pixels from the screen's top left, for a description drawn in `rect`. */
function landed(points, description, { left, top, width, height }) {
  const camera = new OrthographicCamera();
  polyView(camera, description, width, height);
  return points.map(p => {
    const ndc = new Vector3(...p).project(camera);
    return [left + (ndc.x + 1) / 2 * width, top + (1 - ndc.y) / 2 * height];
  });
}

const near = (a, b, label) => a.forEach((p, i) => p.forEach((v, k) =>
  assert.ok(Math.abs(v - b[i][k]) < 1e-6, `${label}: point ${i} is at ${p} not ${b[i]}`)));

const whole = { left: 0, top: 0, ...SCREEN };
const letter = squareOn(O_TRACK.shape, { ...O_TRACK, perCube: LETTER.height / HEIGHT });
const scene = layoutScene(O_TRACK.shape);
const points = cornersOf(boundsOf(scene.pieces));
const from = endOf(letter.camera, LETTER);
const to = endOf(scene.camera, CARD);
const shot = t => pinnedShot(shotBetween(from, to, t), SCREEN.width, SCREEN.height);

test('the zoom starts as the O, where the O is', () => {
  near(landed(points, shot(0), whole), landed(points, letter.camera, LETTER), 'start');
});

test("the zoom ends as the post's viewer, where its canvas is", () => {
  near(landed(points, shot(1), whole), landed(points, scene.camera, CARD), 'end');
});

test('part-way, the track is pinned to the box at its scale', () => {
  for (const t of [0.25, 0.5, 0.8]) {
    const end = shotBetween(from, to, t);
    const [middle, beside] = landed([end.target, [end.target[0] + 1, end.target[1], end.target[2]]], shot(t), whole);
    near([middle], [end.at], `t ${t}`);
    const across = Math.hypot(beside[0] - middle[0], beside[1] - middle[1]);
    assert.ok(across <= end.perUnit + 1e-6, `t ${t}: a unit is ${across}px, more than ${end.perUnit}`);
  }
});

test('the scale goes by equal ratios and the turn the short way', () => {
  const half = shotBetween(from, to, 0.5);
  assert.ok(Math.abs(half.perUnit - Math.sqrt(from.perUnit * to.perUnit)) < 1e-9);
  const wrapped = shotBetween({ ...from, 'rot-y': 170 }, { ...to, 'rot-y': -170 }, 0.5);
  assert.equal(wrapped['rot-y'], 180);
});
