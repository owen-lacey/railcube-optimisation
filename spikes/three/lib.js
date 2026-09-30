// What the two spike pages share: the project's polygon soup as three.js
// geometry, the meshes built from it (pieces, train, ghosts), a PolyCSS camera
// description turned into an OrthographicCamera, and the one offscreen renderer
// every viewer on a page is drawn through.
//
// Extracted from spike 1 (`main.js`) when spike 2 (`fidelity.js`) needed the same
// building blocks. Throwaway code: nothing under `site/` or `src/` imports it.
import * as THREE from 'three';
import { GEOMETRY } from '../../site/src/lib/render/pieces.js';
import { trainBody } from '../../site/src/lib/render/train.js';
import { trackPath, trainAt } from '../../site/src/lib/render/rail.js';
import { poseRotation, cubePosition, unit, cross, sub, len } from '../../site/src/lib/render/vec.js';
import { CAMERA, REFERENCE_WIDTH, REFERENCE_HEIGHT } from '../../site/src/lib/render/camera.js';
import { SPEED, BODY_Z, TRAIN_H, LIGHT } from '../../site/src/lib/render/dimensions.js';

// ---- polygon soup → BufferGeometry -------------------------------------------

const color = new THREE.Color();

/** A polygon's face normal, from its first three vertices (same winding as PolyCSS). */
export function faceNormal([a, b, c]) {
  return unit(cross(sub(b, a), sub(c, a)));
}

/**
 * Fan-triangulate a polygon list into a non-indexed geometry with per-vertex
 * colours in linear space (what three's materials expect). `shade(poly, normal)`
 * may return a linear `[r, g, b]` to use instead of the polygon's own colour —
 * the way "carried" train lighting is baked in, see `carriedShade`.
 */
export function soupGeometry(polys, { fallback = '#3b82f6', shade = null } = {}) {
  const positions = [], colors = [];
  for (const poly of polys) {
    const { vertices, color: hex } = poly;
    color.set(hex ?? fallback);   // sRGB hex → linear, via three's colour management
    let rgb = [color.r, color.g, color.b];
    if (shade) rgb = shade(poly, faceNormal(vertices), rgb);
    for (let k = 1; k + 1 < vertices.length; k++) {
      for (const v of [vertices[0], vertices[k], vertices[k + 1]]) {
        positions.push(v[0], v[1], v[2]);
        colors.push(...rgb);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();   // non-indexed, so these are face normals
  return geometry;
}

/**
 * PolyCSS's own shading, in JS, so a colour can be fixed at one pose and carried:
 * `base × (directional × max(0, n·L) + ambient) / π` in linear space, which is
 * exactly three's Lambert term — so a `lambert` mesh under `lights()` and a mesh
 * pre-shaded by this and drawn unlit look the same *at the authored pose*.
 */
const L = unit(LIGHT.direction.split(',').map(Number));
export function carriedShade(_poly, n, base) {
  const dot = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
  const bracket = (LIGHT.directional * dot + LIGHT.ambient) / Math.PI;
  return base.map(v => Math.min(1, v * bracket));
}

// ---- materials ---------------------------------------------------------------------

/** The lit, vertex-coloured material every solid mesh uses; `setMaterial` swaps the kind. */
export const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
export const glassy = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });

/** The lit materials on offer, all vertex-coloured; the light rig is the same under each. */
export const MATERIALS = {
  lambert: () => new THREE.MeshLambertMaterial({ vertexColors: true }),
  'lambert flat': () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  phong: () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x222222 }),
  standard: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  unlit: () => new THREE.MeshBasicMaterial({ vertexColors: true }),
};

// One geometry per piece type and colour, shared by every mesh of that type on the page.
const pieceGeometry = new Map();
export const geometryFor = (type, hex) => {
  const key = `${type}|${hex}`;
  if (!pieceGeometry.has(key)) pieceGeometry.set(key, soupGeometry(GEOMETRY[type](hex)));
  return pieceGeometry.get(key);
};
export const trainGeometry = soupGeometry(trainBody());
/** The train with PolyCSS's authored-pose lighting baked into its colours, for drawing unlit. */
export const carriedTrainGeometry = soupGeometry(trainBody(), { shade: carriedShade });

export const basisMatrix = ([mx, my, mz], position) => new THREE.Matrix4()
  .makeBasis(new THREE.Vector3(...mx), new THREE.Vector3(...my), new THREE.Vector3(...mz))
  .setPosition(...position);

export function pieceMesh(piece, material = solid) {
  const mesh = new THREE.Mesh(geometryFor(piece.type, piece.color), material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(poseRotation(piece.pose), cubePosition(piece)));
  return mesh;
}

// ---- the train, paced as drive.js paces it -----------------------------------

export const BODY_REF = BODY_Z + TRAIN_H / 2;

/**
 * A train lapping `pieces`. `at(seconds)` places it and returns where the body's
 * centre is (world units), which is what the train-cell mark follows.
 */
export function driver(pieces, { material = solid, geometry = trainGeometry } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  const path = trackPath(pieces);
  const ref = p => p.pos.map((v, i) => v + p.up[i] * BODY_REF);
  const gaps = path.map((p, i) => len(sub(ref(path[(i + 1) % path.length]), ref(p))));
  const lap = gaps.reduce((a, b) => a + b, 0);
  let k = 0, travelled = 0;
  const self = { mesh, at, fraction: 0 };   // fraction: how far round the lap, 0 up to 1
  function at(seconds) {
    const d = (seconds * SPEED) % lap;
    self.fraction = d / lap;
    if (d < travelled) { k = 0; travelled = 0; }
    while (d - travelled >= gaps[k]) { travelled += gaps[k]; k = (k + 1) % path.length; }
    const a = path[k], b = path[(k + 1) % path.length], f = (d - travelled) / gaps[k];
    const blend = (p, q) => p.map((v, i) => v + (q[i] - v) * f);
    const fwd = unit(blend(a.fwd, b.fwd));
    const raw = blend(a.up, b.up);
    const dot = raw.reduce((acc, v, i) => acc + v * fwd[i], 0);
    const up = unit(raw.map((v, i) => v - dot * fwd[i]));
    const pos = blend(a.pos, b.pos);
    mesh.matrix.copy(basisMatrix([cross(fwd, up), fwd, up], pos));
    return pos.map((v, i) => v + up[i] * BODY_REF);
  }
  return self;
}

/** A train standing still on a `type` piece at `cell`/`pose`, as `stage.setGhosts` places one. */
export function ghost(type, cell, pose, { material = solid, geometry = trainGeometry } = {}) {
  const { basis, position } = trainAt(type, cell, pose);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(basis, position));
  return mesh;
}

// ---- lights and camera -------------------------------------------------------------

/** The project's one light rig (`LIGHT` in dimensions.js), added to a scene. */
export function lights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient));
  const light = new THREE.DirectionalLight(0xffffff, LIGHT.directional);
  // PolyCSS's `direction` points *at* the light; so does a three light's position.
  light.position.set(...LIGHT.direction.split(',').map(Number));
  scene.add(light);
}

// Copied from camera.js, where it is private: the slack a framed layout is given.
const MARGIN = 0.88;
const rad = d => d * Math.PI / 180;
const numbers = target => String(target).split(',').map(Number);
const UP = new THREE.Vector3(0, 0, 1);
const DISTANCE = 2000;   // world units back from the target; anything the post draws is far inside

/**
 * Put an OrthographicCamera where a `<poly-camera>` with this description, at
 * this element size, is looking from.
 *
 * PolyCSS's scene transform is `scale(zoom/50) rotateX(rotX) rotate(rotY)
 * translate3d(-target)` over a CSS frame in which x is world forwards, y is world
 * right (screen-down at rest) and z is world up, with 50px to the world unit. So
 * the direction *towards the viewer* is `(sin rotX · cos rotY, sin rotX · sin rotY,
 * cos rotX)` in world right/forwards/up — rot-x 0 is straight down, 90 is side-on
 * — world up projects to screen-up, and one world unit is `zoom` screen pixels.
 * The zoom is scaled the way `createCamera` scales it, against the 900×700
 * reference the descriptions were calibrated on.
 */
export function polyView(camera, description, width, height) {
  const base = { ...CAMERA, ...description };
  const fit = Math.min(width, height * (REFERENCE_WIDTH / REFERENCE_HEIGHT));
  const zoom = Number(base.zoom) * (fit / REFERENCE_WIDTH) * MARGIN;
  const tilt = rad(Number(base['rot-x']));
  const turn = rad(Number(base['rot-y']));
  const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(turn), Math.sin(tilt) * Math.sin(turn), Math.cos(tilt));
  const target = new THREE.Vector3(...numbers(base.target));
  camera.up.copy(UP);
  camera.position.copy(target).addScaledVector(dir, DISTANCE);
  camera.lookAt(target);
  camera.left = -width / 2 / zoom;
  camera.right = width / 2 / zoom;
  camera.top = height / 2 / zoom;
  camera.bottom = -height / 2 / zoom;
  camera.near = 1;
  camera.far = DISTANCE * 2;
  camera.updateProjectionMatrix();
  return zoom;
}

// ---- one renderer, many canvases ----------------------------------------------

const params = new URLSearchParams(location.search);
export const AA = params.get('aa') !== '0';
let pixelRatio = Number(params.get('pr') ?? Math.min(devicePixelRatio, 2));

export const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: AA, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.setScissorTest(true);
let rendererW = 0, rendererH = 0;

/** Make sure the offscreen buffer is at least w×h CSS pixels at the current ratio. */
function fit(w, h) {
  if (w <= rendererW && h <= rendererH && renderer.getPixelRatio() === pixelRatio) return;
  rendererW = Math.max(rendererW, w);
  rendererH = Math.max(rendererH, h);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(rendererW, rendererH, false);
}

export const getPixelRatio = () => pixelRatio;
export function setPixelRatio(pr) {
  pixelRatio = pr;
  rendererW = rendererH = 0;
  for (const v of viewers) v.dirty = true;
}

/** Every viewer on the page, in creation order. */
export const viewers = [];

// Spike 1's rough stand-in for the isometric angle, kept for its loose framing.
const VIEW_DIR = new THREE.Vector3(1, -1, 1).normalize();

export class Viewer {
  /**
   * `build(group)` fills the content; `animate(seconds)` moves it, or is null for
   * a still. `camera` is a PolyCSS description to reproduce exactly; without one
   * the content is framed loosely by its bounding sphere, as spike 1 did.
   */
  constructor(host, { aspect, animate, build, camera = null }) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    host.appendChild(this.canvas);
    if (aspect) host.style.aspectRatio = aspect;
    this.ctx = this.canvas.getContext('2d');
    this.scene = new THREE.Scene();
    lights(this.scene);
    this.camera = new THREE.OrthographicCamera();
    this.camera.up.copy(UP);
    this.described = camera;
    this.visible = false;
    this.dirty = true;
    this.animate = animate;
    this.build = build;
    this.content = new THREE.Group();
    this.scene.add(this.content);
    this.rebuild();
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (e.isIntersecting) this.dirty = true; }, { rootMargin: '100px' }).observe(host);
    new ResizeObserver(() => (this.dirty = true)).observe(host);
    viewers.push(this);
  }

  /** Empty the content group and refill it — a shape change, or the pose cycle's tick. */
  rebuild() {
    this.content.clear();
    this.build(this.content);
    if (!this.described) this.frame();
    this.dirty = true;
  }

  frame() {
    // The meshes carry hand-set matrices, so their world matrices have to be
    // brought up to date before the box is read, or every piece counts at the origin.
    this.content.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.content);
    const centre = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2 * 1.05;
    this.radius = r;
    this.camera.position.copy(centre).addScaledVector(VIEW_DIR, r * 4);
    this.camera.lookAt(centre);
    this.camera.near = 0.1; this.camera.far = r * 10;
  }

  render(seconds) {
    const rect = this.host.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h) return false;
    fit(w, h);
    const pw = Math.round(w * pixelRatio), ph = Math.round(h * pixelRatio);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    if (this.described) {
      polyView(this.camera, this.described, w, h);
    } else {
      const aspect = w / h;
      this.camera.left = -this.radius * aspect; this.camera.right = this.radius * aspect;
      this.camera.top = this.radius; this.camera.bottom = -this.radius;
      this.camera.updateProjectionMatrix();
    }
    this.animate?.(seconds);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    // Copy in the same task as the render, or the source can read back blank.
    const src = renderer.domElement;
    this.ctx.clearRect(0, 0, pw, ph);
    this.ctx.drawImage(src, 0, src.height - ph, pw, ph, 0, 0, pw, ph);
    this.dirty = false;
    return true;
  }
}

/** Render every visible viewer that is dirty or in `moving`; returns how many were drawn. */
export function renderAll(seconds, moving) {
  let rendered = 0;
  for (const v of viewers) {
    if (!v.visible) continue;
    if (moving.has(v) || v.dirty) { if (v.render(seconds)) rendered += 1; }
  }
  return rendered;
}

/** A row of toggle buttons that redraws itself with the new pick. */
export function buttons(el, options, current, onPick) {
  el.replaceChildren(...options.map(o => {
    const b = document.createElement('button');
    b.textContent = String(o);
    b.setAttribute('aria-pressed', String(o === current));
    b.onclick = () => { onPick(o); buttons(el, options, o, onPick); };
    return b;
  }));
}
