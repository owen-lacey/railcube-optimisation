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

The showcase site is `site/` — SvelteKit, prerendered to static files, deployed to GitHub
Pages by `.github/workflows/pages.yml`. It has its own `package.json`, and it imports the
model from `src/` by relative path rather than copying it, so both installs are needed
before it builds. `npm run site` from the root starts it.

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
`model.maximize` — the model is satisfiability-only and the score is computed arithmetically
for reporting. This is faster, not just simpler: the 18-cube `SET` goes from proving optimal
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

### cpsat-js bug (still present in 1.2.0): `notEquals` does nothing

`IntVar.notEquals` builds a constraint that is silently a no-op — two variables pinned to the same value still solve. `src/solver/index.js` uses a `differ` helper (a reified pair of strict inequalities) instead. `tests/library.test.js` asserts the bug still exists, so fixing the port will fail that test and point at the workaround to delete. `addAllDifferent` and `onlyEnforceIf` are fine, as are `addHint` and `onSolution`.

## Visualisation: PolyCSS

Track layouts and the train are rendered with [PolyCSS](https://polycss.com) (`@layoutit/polycss`), a CSS 3D engine that renders meshes as real DOM elements. Use the `polycss` skill (`.claude/skills/polycss/`) when touching visualisation code — it has the API cheat-sheet, verified gotchas where the official docs are wrong, and the full docs mirrored offline. A working example lives at `spikes/polycss/index.html`.

**The renderer lives in the site now** — `site/src/lib/render/`, split into `dimensions.js`
(measurements), `vec.js` (the project → PolyCSS axis map and pose rotations), `pieces.js`
(one geometry generator per piece type), `rail.js` (where the rail runs, plus the
`assertRailMouths` check that runs at import), `train.js` (the lofted body) and `viewer.js`
(the imperative PolyCSS binding). `site/src/lib/scenes.js` is the scene catalogue that the
old `?scene=` query parameters used to select. The 945-line `spikes/track-piece/index.html`
this was extracted from is gone; `spikes/polycss/index.html` stays as the minimal
working example.

Run it with `npm run site` from the repo root (or `npm --prefix site run dev`). The site
imports the model by relative path — `../../../src/track.js` — so `site/vite.config.js`
sets `server.fs.allow` to reach outside its own root, and it still needs
`optimizeDeps.exclude: ['cpsat-js']` and deliberately still sets no COOP/COEP; both
comments moved there from the deleted root `vite.config.js`. It also sets
`worker.format: 'es'`, because the solve worker's bundle code-splits on cpsat-js's glue
and Rollup cannot code-split into Vite's default `iife` worker format.

The `/solve` page is the live one, but not an optimising one: it enumerates rather than
maximises. `site/src/lib/solve-worker.js` runs `allSolutions: true, maxSolutions`
against a 16-cube curves-only inventory (4 of every curve, no straights), with `fill`
forcing every solution to spend the whole thing — so a fresh, legal, full layout appears
roughly every 2-3 s, and every one of them ties on score (`CLAUDE.md`, above, on why a
full-inventory loop's score is constant). That inventory choice is deliberate and
measured, not the model's own 18-cube `SET`: the same live-enumerate approach against
`SET` took 16-70 s *per* layout, because dropping in the two straights turns "find one
more way to spend the inventory" back into a search almost as hard as finding the
optimum. `enumerateAllSolutions` (streaming one uncapped search) was tried first and
rejected — cpsat-js's `onSolution` return value is ignored, so nothing can stop that
search by count, only by `maxTimeInSeconds`. `allSolutions` + `maxSolutions` (re-solving
with a no-good cut per round) is the one that can actually be capped at a number.

**What "pause" can honestly mean on that page.** `solve()` blocks its thread for a whole
round and cpsat-js ignores `onSolution`'s return value, so a running sweep cannot be
paused. The page therefore separates two things and says so in the copy: *pause* stops the
canvas advancing onto each new layout while the search carries on filling the list, and
*stop* ends the sweep. Every layout found stays in the list and can be clicked back to,
which costs nothing because only the shape string ever crosses the worker boundary.

**Camera zoom is scaled by viewer size.** Every camera in `scenes.js` — auto-framed and
hand-tuned alike — is calibrated against the old spike's fixed 900×700 canvas, so
`viewer.js` scales `zoom` by the element's actual fit against that reference. Without it
every layout is cropped on anything smaller, which is every card on the site.

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
