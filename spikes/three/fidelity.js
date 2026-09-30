// Spike 2: visual fidelity. Each scene the post draws is rendered twice, side by
// side — three.js through `lib.js` on the left, PolyCSS through the site's own
// `stage.js` on the right — so the material, lighting, camera and transparency
// choices for the port can be made by looking, and "identical" can be measured
// with a difference overlay rather than argued.
import * as THREE from 'three';
import '@layoutit/polycss/elements';
import { createStage } from '../../site/src/lib/render/stage.js';
import { trackPhase } from '../../site/src/lib/render/build.js';
import { gridLines, cellBox } from '../../site/src/lib/render/grid.js';
import { CAMERA } from '../../site/src/lib/render/camera.js';
import { COLORS, LIGHT, TRAIN_CELL_INSET } from '../../site/src/lib/render/dimensions.js';
import { toWorld, toCell } from '../../site/src/lib/render/vec.js';
import {
  singlePiece, pieceMove, poseCycle, poseGhost, openScene, extentOf, frame, frameFit, cornersOf,
} from '../../site/src/lib/scenes.js';
import { POSES, startCell, cellsFor } from '../../src/track.js';
import {
  AA, MATERIALS, soupGeometry, pieceMesh, driver, ghost, Viewer, viewers, trainGeometry,
  carriedTrainGeometry, renderAll, getPixelRatio, setPixelRatio, buttons,
} from './lib.js';

// ---- the knobs ---------------------------------------------------------------------

const settings = {
  material: 'lambert',       // see MATERIALS in lib.js
  train: 'live',             // live: lit as it turns | carried: the authored pose's lighting, as PolyCSS
  lines: 'prisms',           // prisms: thin boxes, as PolyCSS needs | segments: one-pixel GL lines
  transparency: 'ordered',   // ordered: depthWrite off + renderOrder | naive: three's defaults
  overlay: 'off',            // off | difference | half
};

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The materials in force, remade when a knob changes so every viewer rebuilds with them. */
let mats = null;
function remake() {
  const overlayish = extra => settings.transparency === 'ordered'
    ? { transparent: true, depthWrite: false, ...extra }
    : { transparent: true, ...extra };
  const opacity = Number(css('--grid-opacity'));
  mats = {
    solid: MATERIALS[settings.material](),
    unlit: MATERIALS.unlit(),
    grid: new THREE.MeshBasicMaterial({ color: css('--grid-color'), ...overlayish({ opacity }) }),
    gridLine: new THREE.LineBasicMaterial({ color: css('--grid-color'), ...overlayish({ opacity }) }),
    fill: new THREE.MeshBasicMaterial({ color: css('--grid-color'), ...overlayish({ opacity }) }),
    before: new THREE.MeshBasicMaterial({ color: css('--ghost-before'), ...overlayish({ opacity: Number(css('--ghost-opacity')) }) }),
    after: new THREE.MeshBasicMaterial({ color: css('--ghost-after'), ...overlayish({ opacity: Number(css('--ghost-opacity')) }) }),
  };
}
remake();

// In `ordered` mode the overlays draw after the solids and in this order among
// themselves; `naive` leaves every renderOrder at 0 and lets three sort by distance.
const ORDER = { grid: 1, ghost: 2, fill: 3 };
const ordered = (mesh, kind) => {
  mesh.renderOrder = settings.transparency === 'ordered' ? ORDER[kind] : 0;
  return mesh;
};

// ---- the three.js side --------------------------------------------------------------

const cellGeometry = soupGeometry(cellBox(TRAIN_CELL_INSET));

/** The lattice as one-pixel GL lines: the same lines `gridLines` draws as prisms. */
function gridSegments({ lo, hi }) {
  const planes = (a, b) => Array.from({ length: b - a + 2 }, (_, i) => a - 0.5 + i);
  const cuts = [0, 1, 2].map(a => planes(lo[a], hi[a]));
  const points = [];
  for (const axis of [0, 1, 2]) {
    const [u, v] = [0, 1, 2].filter(k => k !== axis);
    for (const pu of cuts[u]) for (const pv of cuts[v]) {
      for (const end of [cuts[axis][0], cuts[axis].at(-1)]) {
        const p = [0, 0, 0];
        p[axis] = end; p[u] = pu; p[v] = pv;
        points.push(...toWorld(p));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function gridMesh(box) {
  return settings.lines === 'segments'
    ? new THREE.LineSegments(gridSegments(box), mats.gridLine)
    : new THREE.Mesh(soupGeometry(gridLines(box)), mats.grid);
}

function ghostMesh({ type, cell, pose, tint }) {
  if (!tint) return ghost(type, cell, pose, { material: mats.solid });
  return ordered(ghost(type, cell, pose, { material: mats[tint] }), 'ghost');
}

function fillMesh(cell) {
  const mesh = new THREE.Mesh(cellGeometry, mats.fill);
  mesh.position.set(...toWorld(cell));
  return ordered(mesh, 'fill');
}

/**
 * A three.js panel of a scene: `{ pieces, camera, drive, grid, ghosts, fill }`, the
 * same shape `TrackViewer` takes. Returns the viewer and a `fraction()` of the lap
 * its train is at, so the PolyCSS panel beside it can hold its own train there.
 */
function threePanel(host, scene, { aspect }) {
  let train = null, mark = null, fraction = 0;
  const viewer = new Viewer(host, {
    aspect,
    camera: scene.camera,
    animate: scene.drive ? seconds => {
      const body = train.at(seconds);
      fraction = train.fraction;
      mark?.position.set(...toWorld(toCell(body)));
    } : null,
    build(group) {
      for (const piece of scene.pieces.filter(p => !p.revisit)) group.add(pieceMesh(piece, mats.solid));
      if (scene.grid) group.add(ordered(gridMesh(scene.grid), 'grid'));
      for (const g of scene.ghosts ?? []) group.add(ghostMesh(g));
      for (const cell of scene.fill ?? []) group.add(fillMesh(cell));
      if (scene.drive) {
        train = settings.train === 'carried'
          ? driver(scene.pieces, { material: mats.unlit, geometry: carriedTrainGeometry })
          : driver(scene.pieces, { material: mats.solid, geometry: trainGeometry });
        group.add(train.mesh);
        // The lattice cell the train is in, marked only while there is a lattice.
        mark = scene.grid ? fillMesh([0, 0, 0]) : null;
        if (mark) group.add(mark);
      }
    },
  });
  return { viewer, fraction: () => fraction };
}

// ---- the PolyCSS side, through the real stage ----------------------------------------

/**
 * A PolyCSS panel of the same scene, mounted the way `TrackViewer` mounts one: a
 * `<poly-camera>` sized in pixels by a ResizeObserver, the stage bound to it, and
 * a `trackPhase` run on it. `trainAt` holds the train at a fraction of the lap.
 */
function polyPanel(host, scene, { trainAt } = {}) {
  const cam = document.createElement('poly-camera');
  for (const [k, v] of Object.entries(CAMERA)) cam.setAttribute(k, String(v));
  const sc = document.createElement('poly-scene');
  sc.setAttribute('directional-direction', LIGHT.direction);
  sc.setAttribute('directional-intensity', String(LIGHT.directional));
  sc.setAttribute('ambient-intensity', String(LIGHT.ambient));
  cam.appendChild(sc);
  host.appendChild(cam);
  const stage = createStage(cam, sc, {});
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width) return;
    cam.style.width = `${Math.round(width)}px`;
    cam.style.height = `${Math.round(height)}px`;
    stage.applyCamera();
  }).observe(host);
  stage.frameTo(scene.camera);
  if (scene.grid) stage.setGrid(gridLines(scene.grid));
  if (scene.ghosts) stage.setGhosts(scene.ghosts);
  if (scene.fill) stage.setFill(scene.fill);
  stage.run([trackPhase(stage, scene.pieces, { drive: Boolean(scene.drive), trainAt })]);
  stage.start();
  return { stage, cam };
}

// ---- rows ------------------------------------------------------------------------------

const post = document.getElementById('post');

function el(tag, className, parent = post) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}

function heading(title, note) {
  el('h2').textContent = title;
  if (note) el('p', 'note').textContent = note;
}

/** One comparison: the scene drawn both ways, at `aspect`, in `parent`. */
function pair(scene, { aspect = '16 / 10', parent = post } = {}) {
  const wrap = el('div', 'pair', parent);
  const left = el('div', 'panel three', wrap);
  left.dataset.label = 'three.js';
  const right = el('div', 'panel poly', wrap);
  right.dataset.label = 'PolyCSS';
  left.style.aspectRatio = aspect;
  right.style.aspectRatio = aspect;
  const three = threePanel(left, scene, { aspect });
  const poly = polyPanel(right, scene, { trainAt: scene.drive ? three.fraction : undefined });
  return { wrap, three, poly };
}

// 1. One piece of each type, as the catalogue cards draw them.
heading('1. The pieces', 'The cards\' poses (inside curve at DL, the rest canonical) under the one light rig. '
  + 'PolyCSS shades base × (directional × max(0, n·L) + ambient) / π in linear space, which is three\'s Lambert term exactly; '
  + 'switch the material to see the others.');
{
  const cards = el('div', 'cards');
  for (const type of Object.keys(COLORS)) {
    const pose = type === 'insideCurve' ? 'DL' : 'DF';
    const scene = singlePiece(type, { pose, scale: 1.6 });
    const { wrap } = pair(scene, { aspect: '1 / 1', parent: cards });
    wrap.style.setProperty('--piece', COLORS[type]);
  }
}

// 2. The train: standing on a straight, and lapping the post's first track.
heading('2. The train, standing', 'A solid ghost on a straight at the canonical pose: both sides light it from its normals, so this is the baseline.');
{
  const cell = startCell('DF');
  const type = 'straight';
  const pieces = [{ cell, type, pose: 'DF', color: COLORS[type], ...cellsFor(type, 'DF', cell) }];
  const { camera } = singlePiece(type, { scale: 1.3 });
  pair({ pieces, drive: false, camera, ghosts: [{ type, cell, pose: 'DF' }] }, { aspect: '5 / 4' });
}

heading('2. The train, lapping', 'Both trains are at the same point of the lap (the PolyCSS one is held to the three.js one\'s fraction). '
  + 'PolyCSS carries the authored pose\'s lighting round the whole lap — its train never re-lights on a bank or a wall; '
  + 'three.js lights it live. The "train" knob bakes PolyCSS\'s behaviour into three.js for a like-for-like check; the difference is the decision.');
{
  const { pieces } = openScene('SIOLLOISLL');
  pair({ pieces, drive: true, camera: frame(pieces) });
}

// 3. The camera, on tracks of two sizes, with a readout of the zoom each side applied.
heading('3. The camera', 'PolyCSS\'s rot-x 65 / rot-y -45 orthographic view, reproduced from its transform string: the eye is at '
  + '(sin 65° cos −45°, sin 65° sin −45°, cos 65°) in right/forwards/up, and one world unit is `zoom` pixels. Use the overlay: '
  + 'difference should go black over the whole silhouette.');
{
  const { pieces } = openScene('SIOLLOISLL');
  const { poly, three } = pair({ pieces, drive: false, camera: frame(pieces) });
  const readout = el('p', 'readout');
  const update = () => {
    const rect = three.viewer.host.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    readout.textContent = `PolyCSS applied: zoom ${Number(poly.cam.getAttribute('zoom')).toFixed(4)} rot-x ${poly.cam.getAttribute('rot-x')} rot-y ${poly.cam.getAttribute('rot-y')} target ${poly.cam.getAttribute('target')}\n`
      + `three.js: ${w}×${h}px, frustum ${(three.viewer.camera.right - three.viewer.camera.left).toFixed(1)} world units wide → ${(w / (three.viewer.camera.right - three.viewer.camera.left)).toFixed(4)} px per unit`;
  };
  // After the first render, and again on any resize: the frustum is set at render time.
  new ResizeObserver(() => setTimeout(update, 100)).observe(three.viewer.host);
}
{
  const { pieces } = openScene('XSSLISISSOIILSRISSXSISSOSOIRRSROILSL');
  pair({ pieces, drive: false, camera: frame(pieces) });
}

// 4. Transparent overlays: the lattice, the train's cell and the ghosts, through a track.
heading('4. Overlays through a track', 'The post\'s grid viewer: the lattice, the lit cell following the train. '
  + '"ordered" draws overlays after the solids with depthWrite off, lattice then ghosts then fill; "naive" is three\'s defaults.');
{
  const { pieces } = openScene('SSSSLLIOOILL');
  const grid = extentOf(pieces);
  pair({ pieces, drive: true, grid, camera: frameFit(cornersOf(grid)) });
}
heading('4. Ghost trains', 'Piece moves: a before ghost and an after ghost, tinted and see-through, with the lattice reaching both cells. '
  + 'PolyCSS blends every face of a ghost at 0.6, so its inner faces show through its body; depthWrite off does the same.');
for (const type of ['straight', 'leftCurve']) {
  pair(pieceMove(type), { aspect: '3 / 2' });
}
heading('4. Every pose in one cell', 'The pose cycle: one filled cell with the train in each pose in turn, once a second.');
{
  const scene = poseCycle();
  let index = 0;
  const current = () => ({ ...scene, ghosts: [poseGhost(POSES[index])] });
  const wrap = el('div', 'pair');
  const left = el('div', 'panel three', wrap);
  left.dataset.label = 'three.js';
  const right = el('div', 'panel poly', wrap);
  right.dataset.label = 'PolyCSS';
  left.style.aspectRatio = right.style.aspectRatio = '3 / 2';
  let shown = current();
  const three = threePanel(left, shown, { aspect: '3 / 2' });
  // The viewer's build reads `shown`, so a tick rebuilds with the next ghost.
  three.viewer.build = group => {
    for (const g of shown.ghosts) group.add(ghostMesh(g));
    group.add(ordered(gridMesh(shown.grid), 'grid'));
    for (const cell of shown.fill) group.add(fillMesh(cell));
  };
  three.viewer.rebuild();
  const poly = polyPanel(right, shown);
  setInterval(() => {
    index = (index + 1) % POSES.length;
    shown = current();
    three.viewer.rebuild();
    poly.stage.setGhosts(shown.ghosts);
  }, 1000);
}

// ---- HUD ---------------------------------------------------------------------------------

const hud = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

function rebuildAll() {
  remake();
  for (const v of viewers) v.rebuild();
}

buttons(hud('pr'), [1, 2, 3], getPixelRatio(), setPixelRatio);
buttons(hud('aa'), ['on', 'off'], AA ? 'on' : 'off', v => { params.set('aa', v === 'on' ? '1' : '0'); location.search = params; });
buttons(hud('material'), Object.keys(MATERIALS).filter(k => k !== 'unlit'), settings.material, m => { settings.material = m; rebuildAll(); });
buttons(hud('train'), ['live', 'carried'], settings.train, m => { settings.train = m; rebuildAll(); });
buttons(hud('lines'), ['prisms', 'segments'], settings.lines, m => { settings.lines = m; rebuildAll(); });
buttons(hud('transparency'), ['ordered', 'naive'], settings.transparency, m => { settings.transparency = m; rebuildAll(); });
buttons(hud('overlay'), ['off', 'difference', 'half'], settings.overlay, m => {
  settings.overlay = m;
  document.body.classList.remove('overlay-difference', 'overlay-half');
  if (m !== 'off') document.body.classList.add(`overlay-${m}`);
  for (const v of viewers) v.dirty = true;
});

// ---- the loop ------------------------------------------------------------------------------

function tick(now) {
  requestAnimationFrame(tick);
  const moving = new Set(viewers.filter(v => v.animate));
  renderAll(now / 1000, moving);
}
requestAnimationFrame(tick);
