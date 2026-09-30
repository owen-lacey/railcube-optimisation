// Spike 1: the post's thirteen viewers drawn by three.js through ONE WebGL renderer.
//
// The question is whether a phone holds a frame rate with three ~3,000-quad
// tracks in view at once and their trains lapping, which is what saturates the
// PolyCSS build. The pattern under test is the one a migration would use:
// browsers cap WebGL contexts at about 16 a page, so there is one offscreen
// renderer and each viewer is a plain 2D canvas the frame is copied into with
// `drawImage`. Static viewers render once; only visible, moving ones render per
// frame. Geometry is the real renderer's, so the quad counts are the post's.
//
// The building blocks live in `lib.js`, shared with spike 2 (`fidelity.js`).
import * as THREE from 'three';
import { GEOMETRY } from '../../site/src/lib/render/pieces.js';
import { gridLines, cellBox } from '../../site/src/lib/render/grid.js';
import { openScene, extentOf } from '../../site/src/lib/scenes.js';
import { CUBE, COLORS, TRAIN_CELL_INSET } from '../../site/src/lib/render/dimensions.js';
import { POSES } from '../../src/track.js';
import {
  AA, soupGeometry, glassy, pieceMesh, driver, ghost, Viewer, viewers,
  renderer, renderAll, getPixelRatio, setPixelRatio, buttons,
} from './lib.js';

const params = new URLSearchParams(location.search);
let trainsMode = params.get('trains') ?? 'all';   // all | one | none

// ---- the post's viewers, rebuilt --------------------------------------------------

const BIG = [
  'XSSLISISSOIILSRISSXSISSOSOIRRSROILSL',
  'ILSSXOSSSSSIISLRSISOORSOIRRSXIILSLSI',
  'IIOSSXLSLSSOOISSSSIISSLIRSOXSISRRLIR',
];
const FILLER = 'It uses two straights, two inner loops, two outer, and four right turns. It leaves 25 Rail Cube pieces in the box, unused. Unacceptable. ';

const post = document.getElementById('post');
const drivers = [];   // viewers that have a train lapping, in page order

function addPara(n = 2) {
  const p = document.createElement('p');
  p.textContent = FILLER.repeat(n);
  post.appendChild(p);
}

function addHost(parent = post) {
  const host = document.createElement('div');
  host.className = 'viewer';
  parent.appendChild(host);
  return host;
}

function layoutViewer(shape, { grid = false, aspect = '16 / 10', host = addHost() } = {}) {
  const { pieces } = openScene(shape);
  let train = null;
  const viewer = new Viewer(host, {
    aspect,
    animate: seconds => train?.at(seconds),
    build(group) {
      for (const piece of pieces.filter(p => !p.revisit)) group.add(pieceMesh(piece));
      if (grid) group.add(new THREE.Mesh(soupGeometry(gridLines(extentOf(pieces))), glassy));
      train = driver(pieces);
      group.add(train.mesh);
    },
  });
  viewer.leaves = pieces.filter(p => !p.revisit).reduce((a, p) => a + GEOMETRY[p.type](p.color).length, 0);
  drivers.push(viewer);
  return viewer;
}

// The three intro layouts.
addPara(1);
layoutViewer('SIOLLOISLL');
addPara();
layoutViewer(BIG[0]);
addPara(1);
layoutViewer(BIG[1]);
addPara();

// Known tracks: a different big layout every two seconds, rebuilt from scratch.
{
  const host = addHost();
  let index = 2;
  let pieces = openScene(BIG[index]).pieces;
  let train = null;
  const viewer = new Viewer(host, {
    aspect: '16 / 10',
    animate: seconds => train?.at(seconds),
    build(group) {
      for (const piece of pieces.filter(p => !p.revisit)) group.add(pieceMesh(piece));
      train = driver(pieces);
      group.add(train.mesh);
    },
  });
  viewer.leaves = 2900;
  drivers.push(viewer);
  setInterval(() => {
    if (!viewer.visible) return;
    index = (index + 1) % BIG.length;
    pieces = openScene(BIG[index]).pieces;
    viewer.rebuild();
  }, 2000);
}
addPara();

// Six piece cards.
{
  const grid = document.createElement('div');
  grid.className = 'cards';
  post.appendChild(grid);
  for (const type of Object.keys(COLORS)) {
    const host = addHost(grid);
    const pose = type === 'insideCurve' ? 'DL' : 'DF';
    new Viewer(host, {
      aspect: '1 / 1', animate: null,
      build(group) { group.add(pieceMesh({ type, pose, cell: [0, 1, 0], color: COLORS[type] })); },
    });
  }
}
addPara();

// Piece moves: one straight with a ghost train before and after it.
new Viewer(addHost(), {
  aspect: '3 / 2', animate: null,
  build(group) {
    group.add(pieceMesh({ type: 'straight', pose: 'DF', cell: [0, 1, 0], color: COLORS.straight }));
    group.add(ghost('straight', [0, 1, 0], 'DF'));
    group.add(ghost('straight', [0, 1, 1], 'DF'));
  },
});
addPara();

// The grid layout.
layoutViewer('SSSSLLIOOILL', { grid: true });
addPara();

// Pose cycle: one see-through cell, the train in a new pose each second.
{
  let index = 0;
  const cellGeometry = soupGeometry(cellBox(TRAIN_CELL_INSET));
  const viewer = new Viewer(addHost(), {
    aspect: '3 / 2', animate: null,
    build(group) {
      const cell = new THREE.Mesh(cellGeometry, glassy);
      cell.position.set(0, 0, CUBE);   // cell [0, 1, 0] is one cube up
      group.add(cell);
      group.add(pieceMesh({ type: 'straight', pose: 'DF', cell: [0, 1, 0], color: COLORS.straight }));
      group.add(ghost('straight', [0, 1, 0], POSES[index]));
    },
  });
  setInterval(() => { index = (index + 1) % POSES.length; if (viewer.visible) viewer.rebuild(); }, 1000);
}

// The placeholders: a long tail of prose, as the post has.
for (let i = 0; i < 12; i++) addPara(3);

// ---- HUD ---------------------------------------------------------------------------

const hud = {
  pr: document.getElementById('pr'),
  trains: document.getElementById('trains'),
  aa: document.getElementById('aa'),
  stats: document.getElementById('stats'),
};
buttons(hud.pr, [1, 1.5, 2, 3], getPixelRatio(), setPixelRatio);
buttons(hud.trains, ['all', 'one', 'none'], trainsMode, m => { trainsMode = m; });
buttons(hud.aa, ['on', 'off'], AA ? 'on' : 'off', v => { params.set('aa', v === 'on' ? '1' : '0'); location.search = params; });

// ---- the loop ----------------------------------------------------------------------------

const deltas = [];
let last = performance.now(), statAt = last, rendered = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const delta = (now - last) / 1000;
  last = now;
  deltas.push(delta * 1000);
  const seconds = now / 1000;

  // Which trains lap: all visible ones, only the one most in view, or none.
  const moving = new Set();
  if (trainsMode === 'all') for (const v of drivers) if (v.visible) moving.add(v);
  if (trainsMode === 'one') {
    let best = null, share = 0;
    for (const v of drivers) {
      if (!v.visible) continue;
      const r = v.host.getBoundingClientRect();
      const s = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
      if (s > share) { share = s; best = v; }
    }
    if (best) moving.add(best);
  }

  rendered += renderAll(seconds, moving);

  if (now - statAt > 1000) {
    const sorted = [...deltas].sort((a, b) => a - b);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const onScreen = viewers.filter(v => v.visible);
    const leaves = onScreen.reduce((a, v) => a + (v.leaves ?? 0), 0);
    hud.stats.textContent =
      `fps ${(1000 / mean).toFixed(0)}  p50 ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}ms  p90 ${sorted[Math.floor(sorted.length * 0.9)].toFixed(1)}ms  max ${sorted.at(-1).toFixed(0)}ms\n` +
      `visible ${onScreen.length}  moving ${moving.size}  renders/s ${rendered}  quads in view ${leaves}  tris drawn ${renderer.info.render.triangles}  dpr ${devicePixelRatio} → ${getPixelRatio()}${AA ? ' aa' : ''}`;
    deltas.length = 0; rendered = 0; statAt = now;
  }
}
requestAnimationFrame(frame);
