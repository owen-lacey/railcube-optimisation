# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Optimising track layouts for **Rail Cube**, a children's magnetic monorail toy: cube blocks click together into 3D tracks and a mini train runs along them (including up walls and upside down). The deliverable is a blog post that builds up a constraint model incrementally — starting simple, then slowly adding constraints and objectives.

## Ground rules

- **This is a learning exercise for Owen.** Do not prescribe the modelling or build ahead of his direction. Answer what's asked, flag genuine contradictions or knock-on effects, and let him drive the design decisions.
- **Accessible vocabulary only.** Directions are up/down, left/right, forwards/backwards — never x/y/z coordinates. The frame is **fixed from the viewer's perspective** (not train-relative), matching the isometric layout used for visualisations.

## Known hard constraints

- The track must end where it begins — same cell *and* same pose (closed loop).
- No collisions: at most one piece per cell, and no cell is ever both material and train. Train cells may coincide with each other, since there is only one train. See `docs/coordinates.md`.

## The model lives in `src/`

| File | |
|---|---|
| `src/track.js` | poses, the piece catalogue, `SCORES`, both hard constraints. The single source of truth — solver, tests and site all import it |
| `src/routes.js` | known-good routes |
| `src/enumerate.js` | brute-force DFS. The oracle the solver is checked against |
| `src/solver/` | the CP-SAT model, behind the `solveTrack` facade |

`site/` is the SvelteKit app, plus the components it draws with, developed in Storybook
(`.storybook/`, `npm run storybook`). Two routes: the front page is a solve viewer — pick one
of the two swept configurations (`site/src/lib/sweeps.js`), shuffle for a random layout — and
the draft blog post lives at `/post`, deliberately unlinked from it. On narrow screens the
front page gets a taller 4/3 viewer but the same sequencing as desktop. Deployed to GitHub Pages
by `.github/workflows/deploy.yml`, which sets `BASE_PATH` for the repo-subpath URL;
`kit.paths.base` reads it and stays empty locally. The four
showcase pages that used to live here (overview, pieces, layouts, a live `/solve`) are gone;
what survived is the renderer, two thin components over it, and fourteen stories —
one per piece, one per piece's 24-pose gallery, and a `Layout` story whose `shape` control
takes any shape string, which is what the old `/view?shape=` page did.

**One `package.json`, at the repo root**, covering the model, the app and Storybook. The app
imports the model by relative path (`../../../src/track.js`) and they share one
`node_modules`, so one `npm install` does everything. The app's *source* stays in `site/`
while its config lives at the root — `svelte.config.js` remaps `kit.files` at `site/src/…`
and `outDir` to `site/.svelte-kit`, because SvelteKit and Storybook both take their project
root from the cwd. Every `files` entry is set explicitly, including the ones with no file
yet, so nothing defaults to a path inside `src/` — which here is the model, not an app.

**Closure is a question `chainOpen` answers and `chainTrack` insists on.** `chainTrack`
throws unless the route closes, which is right for a solver's output and useless for one
being built by hand — a track being typed is open at every keystroke but the last. So the
walk lives in `chainOpen(route)` → `{ placed, head, closed, faults }`, which places every
piece and *reports* rather than refuses; `chainTrack` is that plus three throws. Two things
about it that were learned rather than designed:

- **`chainTrack`'s order of complaint is not the route's order**, and the tests pin it. An
  over-crossed cross outranks everything (the route in `tests/cross.test.js` proving that
  rule also fails to close *and* collides first), then closure, then collisions — because a
  collision used to be looked for only once the whole route was down. `faults` is in route
  order and `faults[0]` is the first piece that cannot go down, which is the one a *builder*
  has to be shown. The two disagree deliberately.
- **`createClaims()` is the collision rule, accumulated one piece at a time.**
  `assertNoCollisions` is it plus a throw. It exists because two whole-list passes can say
  *that* a route collides but not *which piece* introduced it, and an index is exactly what
  a typing UI needs. Every pair is still checked once.

**The step budget is always an upper bound.** `steps` is the most pieces a loop may have;
the used ones are a contiguous prefix and the tail is switched off. So the model is
trivially feasible — it can always drop everything but a four-piece ring — and an
`INFEASIBLE` result is a fact about the box being too small, or a bug, never about the
inventory. When comparing against `enumerateLoops`, both sides must therefore ask for loops
of *up to* N; passing `minPieces: N` to the oracle makes it answer a different question.

**`SCORES` is inert when the whole set fits.** The objective sums `SCORES[type]` over the
cubes placed, so when the optimum spends the entire inventory the score is
`Σ SCORES[t] × inventory[t]` — a constant, independent of the arrangement *and* of the
weights. Every full-inventory loop ties. Re-weighting the piece types cannot break those
ties; only a term that reads the arrangement (faces reached, span, inversions) can. Worth
knowing before tuning the table and expecting the answers to move.

**Two parities every closed route obeys** — check them before asking a solver whether an
inventory can be fully spent, because they answer some of those questions for free:

- **The curve count is even.** Every curve — left, right, inside, outside alike — is a
  quarter-turn of the cube, and quarter-turns split the 24 poses into two families of 12
  that every curve swaps and every straight preserves (verified computationally against
  `step`). Closing on the start pose means an even number of swaps. This is the 3D
  generalisation of the flat-track rule that left-turns minus right-turns is a multiple
  of 4 — which itself does *not* survive into 3D.
- **The straight count is even too.** Every piece moves the head an odd number of cells,
  so a closed route has even length (3D checkerboard); even total minus even curves
  leaves even straights.

So an inventory with an odd number of straights, or an odd total of curves (however split
across the four types), can never be spent in full — no solve needed. The cross is the one
escape hatch: a crossed cross is traversed twice, so the even quantity is really straights
plus *uncrossed* crosses, and one uncrossed cross can pair with an odd straight.

These parities are necessary, not sufficient — the geometry adds its own infeasibilities
on top (two of each curve cannot close at all, per `src/track.js` on `SET`). Where the
line sits: 4 straights + 3 of each curve *is* fully spendable — `explore.py` (full-spend
is its only mode now) found and verified a 16-cube witness in ~12 s — so three-of-each
closes; it is only the solve that slows there, and only two-of-each that is impossible.

`npm test` runs the fast tier (~73 s, no dev dependencies). `SLOW=1 npm test` adds the exhaustive searches and full-inventory solves. Slow tests are skipped by name, never silently.

Three rules that keep the tests honest, all learned the hard way:

- **Never assert on a solver variable.** Feed the route back through `chainTrack` and count in plain JavaScript. A silently-unenforced constraint (see below) was caught only because of this.
- **Use CP-SAT to optimise, the DFS oracle to enumerate.** Enumerating all eight-piece loops takes ~80 s by no-good cuts and ~1 s by DFS.
- **A test whose subject is a size must assert that size.** Removing `optionalSteps` made `steps` an upper bound, and two timing tests in `tests/clearance.test.js` went on claiming to measure a 12- and a 32-piece solve while actually measuring a 4-piece ring. Every assertion in them was still true, and they got *faster*, which reads as good news. Nothing in the suite could catch it; it surfaced only from re-measuring by hand. They now carry the objective that forces the budget to be filled, plus an explicit length assertion.

### The model has been checked against a second solver

The 18-cube optimum was independently reproduced on **native OR-Tools** (Python, ortools
9.14) from a separately written model: it found `LRRIIOOSRLLOOLSRII`, a *different* layout
from the JS solver's `LIRIROSOLORLLSORII`, with the same 18 cubes and the same score of 34.
Both verified legal through `chainTrack`. Two implementations, two optima, one value — which
is evidence the model is right rather than merely self-consistent.

Both now live in `src/layouts.js` as `set` and `setOnNativeOrTools`, so
`tests/layouts.test.js` re-chains them and re-counts them against the inventory on every
run. The witness is under test rather than in a comment, which matters because the model
that produced it is gone. (There are many more: one benchmark run turned up
`LLIIROORLSLROOSRII`, another 34-point 18-cube layout, and the 16-cube set has at least 33
distinct optima up to rotation and mirror.)

That Python model has since been deleted. It existed because cpsat-js ran out of WASM heap
on the old 36-cube set, and the set is now browser-sized, so it was 436 lines of untested
duplicate model — transitions, collisions, crossings, inventory, objective — with nothing
keeping it in step. The DFS oracle in `src/enumerate.js` is the testable version of the same
idea and runs on every `npm test`. Native CP-SAT has since been rewritten as an exploration
tool, on different terms — see the next section.

### Exploration on native CP-SAT: `scripts/explore.py`

`uv run scripts/explore.py` is the core model on native OR-Tools, and it is the tool for
**exploratory questions that might not be performant** — bigger inventories, wider boxes,
speculative constraint or objective tweaks, anything where a wrong guess on the WASM build
costs minutes per attempt. Try things here first; only what survives is worth the slower
JS solve.

**Every piece in the inventory must be used — this is the only mode, and it diverges from
`src/solver/index.js` on purpose.** The loop length is always `sum(inventory.values())`,
inventory constraints are `==` not `<=`, and there is no `--steps`/`--fill` flag because
there is nothing to switch between. That makes `INFEASIBLE` here mean something different
from the JS model's steps-are-an-upper-bound reading above: it legitimately means *this
inventory cannot be fully spent in this box*, not "box too small or a bug". Full spend also
means every solution ties on score (see "SCORES is inert" above), so there is no
`model.maximize` by default — the model is satisfiability-only and the score is computed
arithmetically for reporting. (`--random` is the exception, below.) This is faster, not just simpler: the 18-cube `SET` goes from proving optimal
in ~21 s cold (~7 s hinted) down to ~3 s feasible, because there is no search over shorter
loops and no improvement phase to prove past. If fill-always ever needs an
arrangement-reading objective back (consecutive-piece penalties etc.), that is a separate
piece of follow-up work, and would need to earn back that speed.

It avoids the fate of the deleted Python model by construction, not by discipline:

- **Geometry is never hand-ported.** It runs `node scripts/export-geometry.js` on every
  invocation and reads the tables — poses, transition rows, cell footprints, `SCORES` —
  off `src/track.js`. There is no generated file to go stale.
- **Every answer goes back through the JS.** The solved route is checked with
  `node scripts/check-route.js <shape> --any`; a solve that fails verification exits
  nonzero. The Python side never trusts its own solver, same rule as the tests.
- **Core scope only**: no crossings encoding, no cross piece (it errors on an inventory
  holding crosses), no `allSolutions` loop. `src/solver/index.js` is the model of record —
  it still allows dropping pieces and keeps the optimisation objective — and the two are
  kept diffable function by function apart from the full-spend divergence above.

Two consequences of that scope. First, anything it finds is a *candidate* until the JS
model or a test owns it — a layout worth keeping goes into `src/layouts.js` where
`tests/layouts.test.js` re-chains it, not into a comment. Second, if exploration ever
needs a feature the JS model doesn't have, that is the signal to build it in the JS
first, or accept that the Python has become the untested duplicate again.

(Its first run reproduced the witness: `RSIILOOLRRSROOLIIL`, a third distinct 34-point
18-cube layout.)

**`--random` is how you get a different layout each run.** It maximises a random weight per
*(step, piece type)* — the arrangement-reading term "SCORES is inert" above says is the only
thing that can break the full-spend tie, since every such loop holds the same multiset of
pieces and only their order differs. `--seed` reproduces a run and is printed when not
given; `--rounds N` re-randomises and re-solves N times, reporting how many of the N came
back distinct. Two things measured rather than assumed:

- **It does not need the optimum proved, which is what makes it usable.** Every round times
  out at `feasible` — 60 s was not enough to prove a random optimum on the 18-cube `SET` —
  and yet the weights steer the very first dive, so 6 rounds at **5 s each** gave 6 distinct
  layouts, and 4 rounds at 30 s gave 4 distinct on a 28-cube inventory. Set `--time` low;
  the round line prints the status so a degraded round stays visible.
- **`--random` and `--symmetry` are mutually exclusive**, and the script errors on the pair:
  the mirror break fixes which handedness appears first, cutting away exactly the mirrored
  layouts randomising is there to find.

Distinctness is by shape string, so it counts rotations and mirrors as different layouts.

**Long sweeps are recorded and resumable.** `--out FILE` appends one JSON Lines record per
round — master seed, round seed, shape, score, span, wall time, status, and the config
fingerprint — flushed before the next round starts, so a killed sweep loses only the round
in flight and the file needs no repair. `--rounds 0` runs until stopped, and Ctrl-C prints
the summary instead of a traceback. `--resume` carries on: it takes the master seed from the
file, replays the seed stream past the rounds already recorded, and continues, so nothing is
re-trodden. Four things that keep the file honest:

- **`--rounds` is a total for the file, not an increment**, so `--rounds 6 --resume` on a
  3-round file does rounds 4-6 rather than 3 more.
- **Resume refuses on a changed question.** The config fingerprint (inventory, box, floor,
  exclusions, start pose) is on every line and must match, because one file holding two
  inventories is a file of incomparable layouts. Use a new `--out`.
- **`--resume` with `--seed` is an error**, not a silent restart of the stream.
- **`--out` with `--no-verify` is an error** — records claim to be verified layouts.

Each round is a fresh `build_model`, so a long sweep re-pays model construction every round;
that is the cost of new weights. `--random` does not exclude what it has already found, so
long runs do re-discover layouts (the round line marks each `new` or `seen`). Feeding the
recorded shapes back as no-good cuts would make a long sweep strictly productive, and is
follow-up work rather than something this does.

### cpsat-js bug (still present in 1.2.0): `notEquals` does nothing

`IntVar.notEquals` builds a constraint that is silently a no-op — two variables pinned to the same value still solve. `src/solver/index.js` uses a `differ` helper (a reified pair of strict inequalities) instead. `tests/library.test.js` asserts the bug still exists, so fixing the port will fail that test and point at the workaround to delete. `addAllDifferent` and `onlyEnforceIf` are fine, as are `addHint` and `onSolution`.

## Visualisation: PolyCSS

Track layouts and the train are rendered with [PolyCSS](https://polycss.com) (`@layoutit/polycss`), a CSS 3D engine that renders meshes as real DOM elements. Use the `polycss` skill (`.claude/skills/polycss/`) when touching visualisation code — it has the API cheat-sheet, verified gotchas where the official docs are wrong, and the full docs mirrored offline. A working example lives at `spikes/polycss/index.html`.

**The renderer lives in the site now** — `site/src/lib/render/`, split into `dimensions.js`
(measurements), `vec.js` (the project → PolyCSS axis map and pose rotations), `pieces.js`
(one geometry generator per piece type), `rail.js` (where the rail runs, plus the
`assertRailMouths` check that runs at import) and `train.js` (the lofted body). The 945-line
`spikes/track-piece/index.html` this was extracted from is gone; `spikes/polycss/index.html`
stays as the minimal working example.

Four shared bindings sit on those: `camera.js` (the zoom calibration below), `meshes.js`
(one mesh per piece, and the two ways to write an orientation onto it), `loop.js` (an rAF
loop with its own clock) and `drive.js` (the train's motion along a route).

**`stage.js` sits on all four, and everything that draws goes through it.** It owns the
scene, *one* camera binding, *one* loop, and the cubes — keyed by piece ID, so the same
mesh can outlive the animation that put it there. That last part is the reason it exists;
see "the same cubes, rearranged" below. An animation is therefore not a viewer but a
**phase**: an `advance(delta, elapsed)` over cubes it was handed, returning `false` when
finished, plus an optional `dispose` for anything it owns that the cubes do not. The stage
runs a queue of them, giving each a clock of its own. `tumble.js` exports `tumblePhase`
(a track collapsing) and `build.js` exports `buildPhase` (a track assembling),
`growPhase` (a track being *extended*) and `trackPhase` (a finished track, drawn at once
and driven).

**The camera is the stage's, never a phase's**, which is why `panTo` lives there. The one
viewer whose camera moves is `Sketch`, and its movement has to *overlap* whatever is
animating rather than be queued behind it — this is not the deleted `panPhase` coming
back. Two consequences: the loop does not stop while a pan is in flight, even with an
empty queue, and `frameTo` cancels a pan rather than fighting it.

There used to be a `viewer.js` for that last one and it is gone: `trackPhase` does the same
job, so keeping both would be two ways to draw one thing. Anything wanting a static track
runs a one-phase queue.

`site/src/lib/scenes.js` is the layer above: the factories that turn a thing into
`{ pieces, drive, camera }`, which is all `TrackViewer` takes. `sceneFromRoute` for a route,
`tumbleScene` for a fall, `sequenceScene` for the union frame a rearrangement needs,
`singlePiece(type)` and `poseGallery(type)` for the catalogue views, `openScene` for a
track part-way through being built, `frame` for the auto-framing, `paint`/`cubesIn`/
`scoreOf` for the colours and the counts. There is deliberately no `buildScene`: the builder
frames the *finished* loop, which is what `sceneFromRoute` already returns, so a factory
there would only have renamed one.
Six components sit on top, in `site/src/lib/components/`: `TrackViewer.svelte` (mounts
PolyCSS, owns the stage and the intersection/resize observers), `PieceViewer.svelte` (a piece
type, alone or in all 24 poses), `LayoutViewer.svelte` (a shape string), `SketchViewer.svelte`
(a text box the track is typed into), `TumbleViewer.svelte` and `BuildViewer.svelte`. The
stories are plain JS CSF files beside them.

`TrackViewer` mounts PolyCSS one way and shows a layout three, chosen by two flags, which is
why the wrappers stay thin rather than becoming copies of the plumbing. Plain: new pieces
are a redraw off an emptied stage. `sequence`: they are a rearrangement — the old layout
collapses and the new one is built out of what falls. `grow`: they are an *extension* —
whatever the two layouts have in common is left standing, untouched, and only the rest
arrives. `sequence` also decides whether `tumble.js` is imported at all: that module reaches
`cannon-es`, so it is loaded dynamically on mount and only when sequencing, which keeps a
physics engine out of a page of static piece cards — and out of `Sketch`, which never drops
anything.

**Whether the layout changed cannot be answered by identity, and getting that wrong is not
a wasted redraw.** `TrackViewer` keys on `type`+`pose`+`cell` per piece (`keyOf`). The mount
draws once and the `$effect` then fires with the very same pieces, and a `$derived` upstream
is free to hand over an equal-but-new array — either of which, compared by reference, reads
as a shape change. In sequencing mode that means the track knocking itself down for no
reason, which is exactly what the first render did until it was caught in a browser.

### Typing a track: `Sketch`

`SketchViewer` is a text box the track is built in front of you, letter by letter. It is
the one viewer that shows an *unfinished* track, and everything below follows from that.

**It goes through `chainOpen`, not `chainTrack`** — see the model section above. The
component's `clean()` is the whole of the input rule: anything that is not one of the six
letters is not a piece and is dropped as it is typed, and the string **stops at the first
piece the model rejects**. Truncating rather than refusing is what makes a keystroke and a
paste the same operation — a letter added to a stuck track truncates straight back to the
stuck track, so the key does nothing, while pasting a *different* shape over it still works.

**A piece with nowhere to go is drawn where it was asked to go**, overlapping whatever it
ran into, pulsing between `ALARM` and `ALARM_FLASH`. Owen's call, over blanking the viewer
or drawing the legal prefix: the overlap is the explanation. Three things about it:

- The pulse is a `setPolygons` on **one** mesh about twice a second, which is nowhere near
  the "never `setPolygons` per frame" rule (that is ~2,000 matrices a frame across a whole
  layout). A CSS class on the `.polycss-mesh` container was rejected: polygon colour can
  come from a baked texture atlas, and `filter`/`opacity` on a `preserve-3d` subtree
  flattens the 3D.
- It lives inside `growPhase` rather than in a phase of its own, so that exactly one thing
  ever writes to a cube in a frame — the same rule `onPickUp` exists to protect.
- **Which step is at fault is not always which cube is.** A cross traversed a third time
  places nothing, so what flashes is the cross already in that cell. `openScene` handles
  that; `cubeIds` is `identify` with revisits kept as `null` so the two line up.

**The camera grows, and only grows.** This is a knowing exception to the doctrine below,
and the reason the two differ is that they are different motions: `Layout` changes the
whole shape at once, so a frame read off it moves every time you type, while a sketch only
ever *extends* — so `growBox` takes the union with what came before and the camera settles
once the track stops reaching new ground. It never shrinks or re-centres on a backspace.
`frameTight` rather than `frameBox`, because `frameBox`'s `SPREAD` is room for a *pile* to
sprawl into and nothing falls here; paying for it drew a four-piece ring at half the size.
Verified in the browser: over 371 camera writes typing out the 18-cube set, zero went the
wrong way and the largest single step was 0.009.

**No train until the loop closes**, because there is no loop to run one on. It appears on
the keystroke that closes and drives from there.

Under `prefers-reduced-motion` the arrivals are instant, the camera snaps instead of
panning, and the rejected piece is a flat red rather than a pulsing one — a pulsing element
is precisely what that preference is about.

**A shape string is always re-derived through `chainTrack`**, in `LayoutViewer` as it was on
the old `/view` page, and in `TumbleViewer` and `BuildViewer` after it: the chain throws
unless the route closes and nothing collides, so an illegal string gets the model's own
objection rendered as text rather than a drawing of nonsense. `Layout/Not a legal track` is
that path under test by eye.

**Never call `setPolygons` per frame.** It rebuilds a `matrix3d` per polygon, and a track
piece is ~110 polygons, so eighteen of them is ~2,000 matrices a frame and the frame rate
visibly collapses — measured, having first shipped the tumbler that way. `meshes.js` is the
whole of the rule: `movingMesh(...).bake` puts an orientation in the *vertices* and is for
orientations that will be held; `.place` puts it on the container with one `setTransform` and
is for orientations that change. The train is the one deliberate exception, and `drive.js`
says why — fifty polygons, and it is the thing being looked at.

**What `place` costs is lighting, and the two animations pay differently.** PolyCSS shades
each polygon from its normal and a CSS rotation cannot recompute a normal, so a `place`d
piece carries the lighting of its baked pose. The tumbler cannot know a resting orientation
in advance, so it lives with that mid-air and re-bakes each body as it falls asleep. The
builder *can* — the resting pose is the one the solver chose — so it bakes at the final pose
the moment a piece sets off and the container carries only what is still to be lost. That
delta reaches nothing exactly as the piece lands, so a built track is lit identically to the
same shape drawn statically — verified by rendering one shape both ways under a pinned
camera and comparing the pixels, not merely reasoned about — and nothing is baked twice.

The one place that had to be *made* true: the tumbler's `settle()` re-lights everything still
in the air when a fall ends, which is a `setPolygons` per cube **in a single frame**. Doing
that for eighteen cubes the build is about to re-bake one at a time put a two-thousand-matrix
spike at exactly the handover. So `tumblePhase` takes a `keep` set of IDs something after it
will re-light anyway, and skips those. Leftovers are not in the set, and are re-lit.

**A build animation is a tween, not the tumbler backwards.** A rigid-body simulation is not
reversible — a pile does not know which of the many tracks that collapse into it was the one
— so `build.js` touches neither cannon nor `physics.js`. What it borrows is `meshes.js`.
Pieces arrive one at a time in route order (`chainTrack`'s order is the order they click
together); the arc is easings on legs of the offset rather than any control points; the train
sets off once the loop closes, which with two kinds of arrival is the *last* landing rather
than simply the last piece.

**Geometry is authored about the piece's keyed cell, always** — every mesh in the project
agrees on that, and PolyCSS rotates about the geometry origin (`autoCenter` defaults to
`false` and nothing here sets it). Anything wanting to move a piece about its **centre of
mass** converts instead: `originAt(type, basis, com)` and `comAt` in `site/src/lib/shapes.js`.
Two things need to. The physics, because cannon treats a body's position as its centre of
mass. And a pick-up, because an arc's cell is a whole cube outside its own material, so
turning about that origin flings the piece round rather than turning it. (This corrects what
this file used to say — the centroid is no longer a physics concern only.)

`shapes.js` is that split: the collision boxes, `CENTROID`, `MASS` and `assertFootprints`,
with no dependency on cannon. `physics.js` keeps the world and the quaternion conversions.
The renderer wants the centroid and does not want a physics engine in the bundle to get it.

**An arrival is a pure axial slide, described in the piece's own frame.** Three wrong answers
were shipped before this one, and the interesting thing is that each was wrong for a different
reason:

1. **An offset fixed in the world.** Every piece then drops from above, and one joining onto
   track that faces downwards descends *through* the layout to reach its own underside. Fixed
   by reading the offset off the pose's basis, so it turns with the piece.
2. **Approaching along the rail *face*.** Defensible-looking — that direction is the one thing
   the model guarantees is clear, since `MOVES` books the whole cell on a piece's rail-face
   side as *train* and `assertNoCollisions` forbids a cell being both material and train — but
   it is the wrong axis. **The joint is at the ends of the rail, not on the face.** The cubes
   click male-to-female along the direction of travel, so a piece cannot be pressed onto the
   track from outside at all. Pressing onto the face is how a Brio set goes together.
3. **A face-normal lift plus an axial close.** Correct at the joint, but the lift was along the
   piece's own local *up* — the canonical pose puts the rail on top — so every piece, whatever
   its pose, set off from the same place relative to itself and read as being lowered onto
   itself. Uniformity in the piece's own frame is still uniformity.

So the arrival *ends* as one straight line down the connector axis and nothing else:
`STANDOFF` back along the piece's own heading, sliding forward onto the previous piece's male
end with the entry mouth leading. Because the direction is the heading alone, it is whatever
the route is doing: over the 18-cube set the eight compass points on screen come out
4 / 4 / 3 / 3 / 2 / 2, with only eight of eighteen arriving from above.

**Two kinds of arrival, and which one a piece gets is not a setting.** It is whether that cube
is already on the stage.

- A **mint** is a piece that is not there: it appears at the standoff and slides on, carrying
  a `TILT` about its own right that `turnEase` spends by 60% of the flight so it is square for
  the close — not nearly square.
- A **pick-up** is a cube lying on the floor where the last layout's collapse left it. That
  cannot be one straight line, because it has to get across the scene first. So it is *two
  legs*: a free-form lift from where it lies to the standoff behind its slot, turning into its
  final pose as it goes, and then the identical axial slide. `liftTurnEase` finishes the turn
  by 80% of the lift, so the slide is a pure translation with nothing left to spend. That is
  the point of splitting it: the doctrine above survives however the piece got there.

The lift interpolates the centre of mass along a straight line with a `sin(πt)` rise added, so
a cube goes over the track rather than through it, and `turnToward` in `vec.js` takes the
orientation along the shortest arc.

**`speed` is one tempo over all four durations.** `timingFor` divides pace, lift, flight and
hold by it, so a faster build is the same build run faster rather than a differently-shaped one,
and the easings stay tuned against proportions that have not moved. `pace` stays separate
because it is the one duration worth setting alone — stretching only the gap between pieces is
how you watch a single arrival, which is what `Build/One arrival, slowly` does.

Speeding the tween up was tried *first*, as the answer to a shape change feeling slow, and Owen's
answer was that it did not address it: what made it feel slow was never the build's own duration
but the wait in front of it, which is `handover` above. Worth remembering before reaching for
this knob again.

The defaults across the four dials are Owen's, set by eye against the sliders: `pace` 0.04,
`speed` 1.2, `handover` 0.5, `drop` 2.

`STANDOFF` is a cube and a bit because that is as far as the axial lane can be relied on, and
the residue is worth knowing rather than hiding. Measured over all eight layouts in
`src/layouts.js`, 188 pieces: a one-cube lane is free for all but six, and those six are
irreducible rather than unlucky. Four are the piece that *closes* a loop, which has both of its
ends mated and therefore no free axis to arrive on at all — you cannot slide the last piece of
a closed track in, you have to flex it. The other two slide onto an already-placed cross, where
the route revisits track it laid earlier. At two cubes the blocked count rises to 13, which is
what set the number.

### The cell the train is in is marked

**The lattice cell** the train's body is in is filled: `cellBox` in `grid.js`, flat and
see-through, and painted with the lattice's own `--grid-color` and `--grid-opacity` — Owen's
call, after a stronger fill of the same colour read as a different blue from the lines. Lines
crossing the fill still come out darker there, because two see-through layers add. It is inset
`TRAIN_CELL_INSET` from the cell's faces, because a train cell's floor is exactly the face of
the cube below it, and coplanar faces flicker. Its near faces sit in front of the train, so the
train reads tinted while it is inside. Bolder edges were built first and then swapped for the
fill on Owen's call. A highlight on the *piece* the train is in (its cube lightened toward
white) came first of all, from misreading him; he kept it for a while, then had it removed,
along with the white start cube — every piece is drawn in its type's colour. The stage owns
the mark: the driver reports a cell every frame, and the stage draws it
only while there is a lattice. It is one mesh, moved with `setTransform` on each new cell and
never redrawn. It follows the body rather than the booked train cells, and
the two differ in ways worth knowing:

- An inside curve books **no** train cells, because its train runs through the curve's own
  footprint. So there the mark sits on material.
- A left or right curve books a 2×2 block, and the arc misses one corner of it.

### Changing a shape rearranges the cubes, it does not replace them

Typing a new shape into `Layout` tumbles the layout that is there and builds the new one out
of the pieces that fall. Not new meshes that look like them — the *same* cubes, picked up off
the floor and carried to new slots. That is the point of the sequence: it shows a set of
pieces being rearranged, which is what the whole project is about, rather than one track
deleted and another drawn. It is also the reason `stage.js` exists, since a mesh belonging to
either animation could not survive the handover.

**Which cube goes where is decided by piece ID, and that is a modelling idea rather than a
renderer detail.** `identify(placed)` in `src/layouts.js` names each cube by its type and its
ordinal in route order: `LLLL` is `1L 2L 3L 4L`, and the second left curve of any shape is the
same physical cube as the second left curve of any other. Revisits are skipped, so a crossed
cross holds one ID. `tests/layouts.test.js` checks every layout's IDs are unique and are its
inventory restated. Two consequences worth knowing: identity is relative to where the route
starts, so a rotation of a shape renumbers its pieces; and matching by ID makes flights cross
each other, which was Owen's call over anything that minimises travel.

Two shapes need not hold the same pieces, and nothing checks that they do. A slot with no cube
of its ID on the floor is **minted** from off-frame — the same path a cold build uses — and a
cube nothing claims is simply left lying where it fell. Both fall out of the design rather
than being handled, which is why there is no mismatch detection anywhere. Leftovers on the
floor are also honest about the inventory: they are the pieces the layout did not spend.

**The collapse and the build overlap, and that is what removes the dwell.** They ran in
sequence first, handing over when the collapse finished. The trouble is that a pile is *busy*
for far longer than it is interesting: measured at drop 1, an 18-cube collapse peaks at 18
cubes/s around 0.4 s and is visually over by about 0.8 s, but it is still rolling and settling
at 4–10 cubes/s until roughly 2.5 s. So waiting for it left well over a second of nothing
happening, which is exactly what Owen saw.

Handing over *earlier* does not work on its own, and the reason is worth keeping: the physics
stops with the phase, so every piece the build has not reached yet freezes in mid-air. Hence
`together(...)` in `stage.js` — the queue is otherwise strictly sequential — and:

- `buildPhase` takes a `delay`, so the two start on the same clock and the build joins in at
  `handover` (default **0.5 s**);
- and an `onPickUp`, wired to the collapse's `release(id)`, which takes that body **out of the
  cannon world** so the rest of the pile stops resting on a piece that has been lifted away,
  and stops the collapse writing to a cube the build now owns. Two things writing one cube every
  frame is the bug that arrangement exists to prevent.

So pieces are plucked out of a pile that is still falling, which is both what a hand does and
what lets the build start while there is something to watch. Measured end to end on the 18-cube
set: a whole shape change takes 3.59 s at `handover` 0.4, 3.89 s at 0.7, and 5.69 s at 2.5 —
that last being the old wait-for-it-to-settle behaviour.

`SETTLE_LIMIT` in `tumble.js` is still 10 simulated seconds and still the right answer when the
collapse is the *subject* — an 18-cube pile gets 16 of 18 bodies asleep in about four seconds
and never gets the last two. In a sequence it is only a backstop, at 2.5 s, for whatever the
build never picks up: the phase now also ends the moment every cube has been lifted out, which
in a same-inventory rearrangement is all of them. One consequence, and an improvement: leftovers
are no longer frozen by the deadline part-way through their fall — they finish falling and
settle.

**The camera never moves, and the frame is not derived from what is being shown** — *in a
rearrangement*. `Sketch` is the one exception and it is Owen's, asked for by name; the
scope of everything below is `sequence` mode, and the difference is what is happening on
screen. A rearrangement replaces the whole shape at once, so a derived frame moves every
time you type and moves *while eighteen cubes are collapsing*. A sketch only ever extends,
so a grow-only box converges and then holds. Attempt 2 below was rejected for `Layout` and
is right for `Sketch`; that is not a contradiction, and do not "fix" either to match the
other. That is
`fixedFrame` in `scenes.js`: a box reaching `REACH` = 6 cells around the start cell, from the
ground up. `TrackViewer` applies it once at mount and nothing touches it again — the framing
effect deliberately reads neither `pieces` nor `camera` in sequencing mode, so a shape change
has nothing to reframe. Verified in the browser: **zero** camera writes over 852 frames
spanning two shape changes.

Six is the **solver's own box constraint** rather than a number picked to look right — every
layout in `src/layouts.js` was solved at box 3, 4, 5 or 6, and the worst reach over all eight
is exactly 6. `tests/stage.test.js` checks that, so a bigger layout added later fails loudly
instead of being silently cropped. A shape typed into the control that reaches further *will*
be cropped; that is the deal a fixed frame makes. The sweeps were solved in bigger boxes — 8
for the crossed one — so `fixedFrame` takes a `reach` (plumbed through `TrackViewer` and
`LayoutViewer`), still a solver box constraint, just that sweep's: the front page passes its
sweep's `question.box`, and `tests/sweeps.test.js` checks every swept shape fits its own box.
Unset, it is `REACH`, and nothing existing changes.

Two earlier attempts, both rejected by Owen on sight, and worth not repeating:

1. **Framing each layout.** A camera that moves every time you type. It has to: over the four
   known 18-cube layouts of the model set the extents run 6×7×9, 8×5×7, 8×5×6 and 9×5×4 and
   the centres move by whole cubes.
2. **A box that only ever grows**, reserved from the first render. Better — it converges and
   then holds — but it still moves on the change that grows it, which is exactly what he could
   see. A `panPhase` (a 0.4 s smoothstep, queued ahead of the collapse) was written to smooth
   that and is **deleted**; do not reintroduce a moving camera *here* without being asked for
   one. It is what `Sketch` does, where it was asked for: a track that only extends grows its
   box a little at a time and then stops, and `stage.panTo` eases it rather than a phase doing
   so — which is the part `panPhase` got wrong, since a queued pan delays what it precedes.

The cost is real and was accepted with the picture in front of him: ±6 is 13×7×13 cells where
an 18-cube layout needs about 8×7×9, so a track is drawn smaller than a tight frame would draw
it *and* sits off-centre, because layouts occupy the box asymmetrically. (The tempting middle
option — have a viewer declare which shapes it will ever show and frame their union up front,
which is both tight and fixed — was offered and turned down. One constant beats a prop.) This
is also why `sequence` is opt-in: a static figure leaves it off and gets the tight per-layout
frame.

**Nothing is drawn for the floor.** cannon's floor is an infinite plane and needs no mesh; a
chamfered slab used to be drawn to stand for it, and it was a hundred-odd polygons that appeared
out of nowhere the moment a shape was typed and then sat behind everything as a dark square. The
pieces stop where they stop either way. `floorSlab`, `FLOOR_MARGIN` and the stage's `setFloor`
all went with it.

`drop` is 2 cubes here rather than the tumbler's 3, since every extra cube of fall is scale
taken off everything. `SPREAD` is 2 cubes of sideways room, and that is knowingly *not*
enough for the worst case: measured at the 2.5 s deadline, a pile sticks out 1.9–3.7 cubes for
the 18-cube set and up to 5.9 for the 32-cube one, so a big collapse does drift out of shot.
Sizing for that would cost far more scale than the pile is worth — it is on screen for two
seconds and the track is what is being looked at.

An illegal shape blanks the viewer as it always did, and the `{#if}` takes the stage with it,
so the cubes go too and the next legal shape is a fresh first render. A first render is never
animated: there is nothing on the floor to pick up.

### The animations are under test

`tests/stage.test.js` drives the real modules against a fake PolyCSS scene — `scene.add`
returning handles that record `setPolygons`/`setTransform`/`dispose` — and a hand-cranked
`requestAnimationFrame` stepped in 16 ms ticks. No DOM, and both `cannon-es` and
`@layoutit/polycss` are runtime dependencies, so it is in the fast tier.

It is the promotion of a throwaway script that had been written and deleted twice. Worth
keeping because *four* of its assertions failed when first written and three of the four were
the assertion being wrong, not the code — a mint's polygons go in through `scene.add`, so it
is never `setPolygons`-ed at all, and coarse time snapshots straddle the handover. The fourth
was real. It asserts, beyond the geometry: that a picked-up cube is the *same handle* it was
before it fell and was never disposed; that a cube with no slot receives no writes at all;
that a pick-up is baked exactly once and a mint never; and that no train is ever abandoned.
A **marker phase** slotted between the two real ones is what makes the ordering assertions
exact rather than a guess at a time — and being able to slot one in is the sequencing itself
under test.

The growing viewer is in there too, on the same fake scene, and its first assertion is the
one that matters: **a cube already standing receives no writes when the next letter is
typed** — no `setPolygons`, no `setTransform`, not disposed and remade. "It does not
twitch" is a claim about writes rather than pixels, which is exactly what the fake scene
can settle and the eye cannot. Beside it: a backspace disposes exactly one cube and leaves
the others the same handles; there is no train until the route closes and exactly one
after; the rejected piece is the *only* mesh ever repainted, about twice a second; and a
stuck track keeps asking for frames while a settled open one stops.

Three bugs the unit tests did not catch, all found by driving Storybook in a real browser
over CDP, which is worth doing for anything in this area:

- **The first render tumbled itself.** `onMount` draws, then the `$effect` fires with the same
  pieces; a truthiness check on "is there something to knock down" saw a shape change. Fixed
  by `keyOf` above. Unreachable from the fake scene, because it is Svelte's effect graph.
- **Every replaced phase abandoned its train**, leaving it hanging in mid-air over the
  wreckage. Phases now have `dispose`, and the stage calls it on a phase it drops. *This* one
  is now under test.
- **A paste that replaced rather than lengthened kept letters the track did not have.** The
  input held `LLLLLSSSSSSSS` while the caption and the scene both stopped at `LLLLL`, so
  eight backspaces did nothing visible. The truncation rule in `clean()` is the fix, and it
  is simpler than the guard it replaced. Invisible to the unit tests because it is the
  component's input handling rather than the renderer.

**`polyRotation` is under test now** — `tests/rotation.test.js`, against the string
`buildPolyMeshTransform` actually emits rather than against the reasoning in `vec.js`. It was
verified once by a scratch script that no longer exists, and it is the one piece of the
renderer where a wrong sign yields a thoroughly plausible wrong animation. The test also pins
the two facts about PolyCSS the conversion depends on: the emitted order is `rotateY rotateX
rotateZ`, and the CSS frame is the world frame with right and forwards swapped. Worst error
over the 24 poses and 20,000 random orientations is 2.2e-14. Two useful things it turned up:
a zero angle is left out of the emitted string altogether, and a transform with nothing in it
comes back `undefined` — which is why a landed piece costs nothing.

`turnToward` is in there with it, for the same reason: the pick-up's lift needs the shortest
arc from however a cube fell to the pose it is going to, so it reads a turn's axis back *out*
of a rotation rather than being handed it. Both singular branches are the common cases here
rather than edge cases — coincident orientations have no axis, and half-turns have none in the
antisymmetric part — so it is checked over all 576 pose pairs as well as random orientations.
At exactly 180° the direction of travel is genuinely undetermined (both ways are the same
shortest arc), and the test asserts only that the choice is stable. One thing it turned up:
`acos` is ill-conditioned near ±1, so *any* angle measured near 0° or 180° carries about 1e-6°
of noise however exact the rotation is — which is what `ANGLE_SLACK` is, and it is why the
first version of the constant-rate assertion failed.

The root `vite.config.js` is now bare — `plugins: [sveltekit()]` and nothing else. Three
workarounds the old `site/vite.config.js` carried are all gone with the solve page, and
should not come back without a reason: `server.fs.allow` (the Vite root is the repo root
now, so the model is inside it), and `optimizeDeps.exclude: ['cpsat-js']` +
`worker.format: 'es'` (both existed for the solve worker; nothing the app imports reaches
`cpsat-js` — `src/track.js` has no imports at all and `src/layouts.js` imports only
`src/track.js`). Anything that solves in the browser again needs all three back, plus the
deliberate absence of COOP/COEP headers, which is what keeps the browser on the
single-worker build whose solution callbacks can actually reach JS mid-search.

**Camera zoom is scaled by viewer size.** Every camera in `scenes.js` — auto-framed and
hand-tuned alike — is calibrated against the old spike's fixed 900×700 canvas, so
`camera.js` scales `zoom` by the element's actual fit against that reference. Without it
every layout is cropped on anything smaller.

**A viewer only animates while it is on screen.** `TrackViewer` and `BuildViewer` both gate
their loop on an `IntersectionObserver` plus `visibilitychange`, because a blog post is
several of these on one page and each running a permanent rAF loop is the one thing that
would make it unusable on a phone. Both honour `prefers-reduced-motion` by running
`trackPhase` instead — a finished, driven track and no animation at all, which for `Layout`
means a shape change is an instant swap off an emptied stage.

Headless Chrome's `--virtual-time-budget` is close to useless for screenshotting these, which
is worth knowing before trying: `loop.js` caps a single delta at 0.1 s on purpose, and virtual
time advances in large jumps, so the animation moves 0.1 s per callback however big the budget
is. Early frames screenshot fine; later ones need a real clock.

What *does* work, and found two bugs the unit tests could not: run `npm run storybook` and
drive it over the DevTools Protocol on a real clock. `ws` is available transitively, so a
throwaway script can connect, `Page.navigate` to
`iframe.html?id=layout--default&viewMode=story`, change the shape the way the control does
(`__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', …)`), and screenshot at intervals while
collecting `Runtime.exceptionThrown`. Counting `[class*=polycss-mesh]` elements is how the
abandoned trains were found — and pinning the camera by hand before two shots is how "lit
identically" was checked as pixels rather than asserted.

## Solver: cpsat-js

Optimisation uses [cpsat-js](https://github.com/owen-lacey/cpsat-js) — Owen's own WebAssembly port of Google OR-Tools' CP-SAT solver (npm `cpsat-js`). It runs in browser and Node with zero native dependencies, and can be tweaked if this project needs features it lacks.

Key API: `CpSolver.create()` (async, expensive — cache it; `solve()` itself is synchronous), `CpModel` with `newIntVar`/`newBoolVar`/`newIntervalVar`, fluent expressions (`x.plus(y).le(10)`), `model.add(bounded)` to post one, `addAllDifferent`, `addBoolOr`/`addBoolAnd`, `addNoOverlap`, `addCircuit`, `minimize`/`maximize`, `.onlyEnforceIf(literal | literals)`, `addHint`/`clearHints`.

**Hints and callbacks arrived in 1.2.0, and both were added for this project.**
`model.addHint(v, n)` suggests a starting point — advisory, so it cannot change the
optimum, and `solveTrack({ hint })` wraps it by mapping a route to its selectors.
`solve(model, { onSolution })` reports each improving solution; `solveTrack` passes it
through as `{ index, live, seconds, score, bound, route, pieces, dropped }`, the last
four from the same `report()` the final answer uses, so an incumbent and an answer are
one shape and every incumbent has been through `chainTrack` before anyone draws it.

**`live` is not a setting, it is a consequence of `numWorkers`.** At 1 worker CP-SAT
solves on the calling thread, so the observer can enter JS mid-search and the callbacks
are live. At ≥ 6 it runs on subsolver pthreads — separate Web Workers under Emscripten
— while the calling thread is blocked inside `solve()`; entering JS from there would
mean proxying to a thread that cannot answer, so incumbents are recorded in C++ and
replayed in order just before `solve()` returns. JS never re-derives that rule: it
always drains the recorded trace, and a live solve simply recorded nothing.

So the browser, which is always single-worker, is the one build that can animate a
search — and `solve()` blocking its thread is why the page must run it in a Web Worker
regardless.

Gaps to design around: there is **no allowed-assignments/table constraint and no element constraint**, so lookups are encoded as one boolean per table row with exactly one true — which makes the whole transition a few plain linear equations. `LinearExpr.plus` rejects a bare `IntVar` even though `IntVar.plus` accepts a `LinearExpr`; call `.toLinearExpr()` when folding.

**Workers.** The package exports map sends Node to a threaded build and browsers to a portable one, so the import never changes. `solve()` takes `numWorkers`, default 8. Use **1 or ≥ 6, never in between** — the number selects *which* subsolver portfolio runs, not just how much parallelism, and 2–4 run a degraded subset that is slower than 1. The portable build clamps to 1, so browser solves get a single strategy.

**Measure the browser's build, not Node's.** `node --conditions=browser` makes Node resolve
the `browser` condition in the exports map, so the portable single-worker binary is the one
under test with no code change anywhere. `scripts/benchmark-sets.js` warns when it is run
without the flag, and now traces the whole improving curve of one solve through
`onSolution` rather than sampling it with one solve per deadline. The difference the flag
makes is not small: proved-optimal times measured both
ways came out 9.7 s vs 3.0 s at 16 cubes, 34 s vs 7.8 s at 18, and 240 s-without-an-answer
vs 34 s at 24. Threads are worth 5–10× here, and the single worker is the reason a
browser-sized set has to be so much smaller than Owen's real one.

One caveat on that warning, measured rather than assumed: run-to-run variance under one
worker is *not* always enormous. Five reps at 16 and 18 cubes came back within ±0.3 s and
with identical scores. The wild variance belongs to the 36-cube regime (boxes 6/7/8 once
timed 63 s / 126 s / 17 s on the same question); at browser scale these instances are
stable enough to compare directly.

Vite gotcha: add `cpsat-js` to `optimizeDeps.exclude`, otherwise esbuild pre-bundling breaks the WASM URL resolution in dev.
