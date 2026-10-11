// The lattice's side-length labels: each says its side's length in cells, and sits
// beside an edge on the outside of the box — the lowest on screen for the flat
// sides, the leftmost for the upright. Checked through a real three.js camera set
// up by `polyView`, as `controls.test.js` checks the pan, so the choice of edge is
// tested against what the camera shows rather than against the reasoning.

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { edgeLengths } from '../site/src/lib/render/lengths.js';
import { polyView, REFERENCE_WIDTH, REFERENCE_HEIGHT } from '../site/src/lib/render/camera.js';
import { toWorld } from '../site/src/lib/render/vec.js';
import { LENGTH_GAP } from '../site/src/lib/render/dimensions.js';
import { cellScene } from '../site/src/lib/scenes.js';

/** `project` in stage.js, on a reference-sized viewer at the page's origin. */
function projector(description) {
  const camera = new OrthographicCamera();
  polyView(camera, description, REFERENCE_WIDTH, REFERENCE_HEIGHT);
  const point = new Vector3();
  return points => points.map(at => {
    point.set(...at).project(camera);
    return { x: (point.x + 1) / 2 * REFERENCE_WIDTH, y: (1 - point.y) / 2 * REFERENCE_HEIGHT };
  });
}

/** Every edge's middle along `axis`, projected, in cell units first. */
function middles({ lo, hi }, axis, project) {
  const [u, v] = [0, 1, 2].filter(a => a !== axis);
  return project([lo[u] - 0.5, hi[u] + 0.5].flatMap(pu => [lo[v] - 0.5, hi[v] + 0.5].map(pv => {
    const p = [];
    p[axis] = (lo[axis] + hi[axis]) / 2;
    p[u] = pu;
    p[v] = pv;
    return toWorld(p);
  })));
}

const box = cellScene('IRSSIIXLSLSOLLSSOSSIIRISSIXSORROSSSI').grid;

test('each label is its side of the lattice, in cells', () => {
  const labels = edgeLengths(box, projector({ 'rot-x': 65, 'rot-y': -45, zoom: 1, target: '0,0,0' }));
  assert.deepEqual(labels.map(l => l.text), ['6', '8', '8']);
});

test('each label sits outside the box, beside the lowest flat edge or the leftmost upright', () => {
  for (const rotX of [30, 65, 80]) {
    for (const rotY of [-45, 0, 100, 210]) {
      const project = projector({ 'rot-x': rotX, 'rot-y': rotY, zoom: 1, target: '0,0,0' });
      const [centre] = project([toWorld(box.lo.map((lo, a) => (lo + box.hi[a]) / 2))]);
      for (const { axis, x, y } of edgeLengths(box, project)) {
        const spots = middles(box, axis, project);
        const edge = axis === 1
          ? spots.find(s => s.x === Math.min(...spots.map(t => t.x)))
          : spots.find(s => s.y === Math.max(...spots.map(t => t.y)));
        const where = `axis ${axis} at rot-x ${rotX}, rot-y ${rotY}`;
        assert.ok(Math.abs(Math.hypot(x - edge.x, y - edge.y) - LENGTH_GAP) < 1e-9, where);
        assert.ok(Math.hypot(x - centre.x, y - centre.y) > Math.hypot(edge.x - centre.x, edge.y - centre.y), where);
      }
    }
  }
});
