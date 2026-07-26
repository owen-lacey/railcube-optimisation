---
name: polycss
description: Working with PolyCSS (@layoutit/polycss) — the CSS 3D engine that renders OBJ/STL/glTF/GLB/VOX meshes as real DOM elements via matrix3d. Use when building or debugging 3D scenes, poly-camera/poly-scene/poly-mesh/poly-box elements, mesh loading, lighting, or runtime animation of meshes. Contains verified gotchas where the official docs are wrong.
---

# PolyCSS

CSS 3D engine: every visible polygon becomes a DOM element positioned with `transform: matrix3d(...)`. No WebGL/canvas — polygons are inspectable, styleable, and take DOM events. Repo: https://github.com/LayoutitStudio/polycss. Docs: https://polycss.com (all pages mirrored in `references/`).

Packages: `@layoutit/polycss-core` (parsers/math, no DOM) · `@layoutit/polycss` (vanilla custom elements + imperative API, re-exports core) · `@layoutit/polycss-react` · `@layoutit/polycss-vue`.

## Minimal working scene (vanilla)

```html
<script type="module" src="https://esm.sh/@layoutit/polycss/elements"></script>

<poly-camera rot-x="65" rot-y="45" zoom="1">
  <poly-scene directional-direction="0.5,-0.7,0.6" directional-intensity="1" ambient-intensity="0.5">
    <poly-box size="20" color="#ffd166" position="0,0,0"></poly-box>
    <poly-box size="20" color="#93c5fd" position="20,0,0"></poly-box>
    <poly-mesh src="/model.vox" auto-center position="40,0,0"></poly-mesh>
  </poly-scene>
</poly-camera>
```

Camera is always the outer element (CSS `perspective` only applies to descendants). `<poly-camera>` is orthographic — perfect isometric, the default and right choice for voxel/diagrammatic scenes. `<poly-perspective-camera perspective="1000">` adds foreshortening.

## Verified gotchas (docs are wrong or silent on these)

1. **Vanilla vector attributes are bare comma-separated: `position="20,0,20"`.** The docs show `position="[0,0,0]"` in places, but every element parses with `value.split(",").map(parseFloat)` — a leading `[` makes the first component NaN and the whole vector is **silently discarded**. Applies to `position`, `rotation`, `scale` (3-part form), `directional-direction`, `target`. (React/Vue props take real arrays: `position={[20,0,0]}`.)
2. **Scene lighting in vanilla uses flattened attributes** — `directional-direction`, `directional-color`, `directional-intensity`, `ambient-color`, `ambient-intensity` — not the JSON `directional-light='{...}'` shown in the core-concepts doc (that's the React/Vue prop shape). Point lights are imperative/framework only.
3. **`position` shares units with geometry size.** `<poly-box size="20">` cubes placed 20 apart sit flush — grid layouts are `position = gridIndex * size`.
4. **`<poly-box>` `size` is scalar-only.** The element parses it with `parseFloat` (verified in `@layoutit/polycss@0.2.8` source), so `size="20,1.5,2"` silently becomes a 20-unit cube. For non-uniform boxes, use a cube `size` plus the vec3 `scale` transform: `<poly-box size="20" scale="0.25,1,0.05">` → 5×20×1. `position` stays in world units (scale is local, applied before translation). **The scale vector's X and Y components are swapped relative to world axes** (verified empirically with `poly-axes-helper`, v0.2.8): `scale="a,b,c"` scales world Y by `a`, world X by `b`, world Z by `c`. A bar long along world Y needs the big factor in the *first* component. `position` is not swapped. Probe page: `spikes/track-piece/probe.html`.
5. **`poly-axes-helper` `thickness` is proportional to `size`, not world units** — `thickness="1"` with `size="80"` draws three 80-unit cubes, not thin lines. Omit it (default is sensibly thin).
6. **Concave polygons render wrongly** (verified in `spikes/track-piece/`, v0.2.8): a concave planar polygon (e.g. a plus-shape or a square with a notch) comes out invisible or mis-filled. Decompose into convex pieces (or fan-triangulate) before adding — see `crossCube`'s five-rect floor and the sweep profile's three-piece end caps in `spikes/track-piece/index.html`.
7. **Custom elements stay empty.** Rendered polygons live in sibling `div.polycss-mesh` containers keyed `data-poly-mesh-index="polycss-mesh-N"` (N = source order of mesh/shape elements). CSS that targets rendered geometry (transitions, highlights) must target those, not your element's id. Leaf tags `<b>/<u>/<i>/<s>` carry `data-poly-index` per polygon; they're internal strategy, don't rely on which tag.

## Runtime animation (verified in spikes/polycss/)

- Transform attributes (`position`, `scale`, `rotation`) update the mesh handle **in place** (`handle.setTransform`) — cheap, no re-mount. Geometry/material attributes (`size`, `color`, `src`) tear down and re-mount the mesh. Animate transforms, never geometry.
- Per-frame movement: `el.setAttribute('position', \`${x},${y},${z}\`)` in a rAF loop → smooth.
- **CSS transitions tween for free**: jump the `position` attribute once and put `transition: transform 1s linear` on `[data-poly-mesh-index="polycss-mesh-N"], [data-poly-mesh-index="polycss-mesh-N"] *` — the browser interpolates the matrix. Ideal for waypoint-to-waypoint motion.

## Coordinates & camera

World space: **+X right, +Y forwards (into screen), +Z up**. Default `rot-x="65" rot-y="45"` is the classic isometric angle; `rot-x="90"` is top-down, `rot-x="0"` head-on. Camera attrs: `zoom` (scale, default 1), `rot-x`, `rot-y`, `distance` (dolly px), `target` (orbit point, comma vec3). Add `<poly-orbit-controls drag wheel>` inside the scene for pointer control.

## Meshes & files

`<poly-mesh src>` loads OBJ (+`mtl`), STL, glTF/GLB, VOX. Parsers normalise to a `targetSize` — longest axis fits N world units, **default 60**. VOX: exposed faces become greedy-meshed colored quads with a baked fast path; MagicaVoxel front (−Y) maps to PolyCSS forward (+X). `auto-center` shifts the model's bbox centre to local origin before `position` applies.

## Performance

Cost scales with mounted leaf count + atlas area (style/layout/paint over every transformed element). Camera/mesh motion is ancestor-transform based (no per-polygon JS), but keep polygon counts low: default `meshResolution: "lossy"` merges coplanar faces (merged regions lose per-polygon addressability); `"lossless"` keeps exact geometry.

## Headless / imperative

From `@layoutit/polycss` (or `-core` sans DOM): `parseObj(text, opts)`, `parseGltf(buffer, opts)`, `parseVox(buffer, opts)`, `loadMesh(url)` → `ParseResult { polygons, warnings, dispose() }` (always call `dispose()`). Polygons are plain objects `{ vertices: [x,y,z][], color?, texture?, uvs?, data? }` — generate them from any data source. `createPolyScene(host, opts)` then `scene.add(parseResult, { position, rotation, scale, castShadow })` → handle with `setTransform()`/`dispose()`.

## References (full docs, offline)

`references/` mirrors polycss.com/docs: `core-concepts.md`, `quickstart.md`, `components-poly-camera.md`, `components-poly-scene.md` (full prop tables), `components-poly-controls.md`, `guides-animation.md` (glTF clips + mixer), `guides-lighting.md` (baked vs dynamic modes, shadows), `guides-performance.md`, `guides-projections.md`, `guides-shapes.md` (per-polygon interaction), `guides-textures.md` (file formats, VOX options), `api-headless.md`, `api-types.md`, `api-three-parity.md`, `api-fonts.md`, `introduction.md`.

Verified live examples: `spikes/polycss/index.html` (static cubes + two moving meshes) and `spikes/track-piece/index.html` (composed poly-boxes with vec3 `scale`) — serve the folder and open in a browser.
