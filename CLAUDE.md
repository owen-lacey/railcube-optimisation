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
| `src/track.js` | poses, the piece catalogue, `SCORES`, both hard constraints. The single source of truth — solver, tests and spike all import it |
| `src/routes.js` | known-good routes |
| `src/enumerate.js` | brute-force DFS. The oracle the solver is checked against |
| `src/solver/` | the CP-SAT model, behind the `solveTrack` facade |

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
idea and runs on every `npm test`. If native CP-SAT is ever wanted again it has to be
rewritten; it was never committed.

### cpsat-js bug (still present in 1.2.0): `notEquals` does nothing

`IntVar.notEquals` builds a constraint that is silently a no-op — two variables pinned to the same value still solve. `src/solver/index.js` uses a `differ` helper (a reified pair of strict inequalities) instead. `tests/library.test.js` asserts the bug still exists, so fixing the port will fail that test and point at the workaround to delete. `addAllDifferent` and `onlyEnforceIf` are fine, as are `addHint` and `onSolution`.

## Visualisation: PolyCSS

Track layouts and the train are rendered with [PolyCSS](https://polycss.com) (`@layoutit/polycss`), a CSS 3D engine that renders meshes as real DOM elements. Use the `polycss` skill (`.claude/skills/polycss/`) when touching visualisation code — it has the API cheat-sheet, verified gotchas where the official docs are wrong, and the full docs mirrored offline. A working example lives at `spikes/polycss/index.html`.

Serve the spike with **Vite, from the repo root** — `npm run spike`, then open
`/spikes/track-piece/index.html`. Root, because it imports `../../src/track.js` from
outside the spike directory; Vite rather than `python3 -m http.server`, because
`?scene=solve` runs the solver in a module worker, that worker imports the bare
specifier `cpsat-js`, and a browser cannot resolve one — nor can a worker be given an
import map, which are window-only. See `vite.config.js`, which also documents why
`optimizeDeps.exclude` and no COOP/COEP.

`?scene=solve` is the live one, but not an optimising one: it enumerates rather than
maximises. `spikes/track-piece/solve-worker.js` runs `allSolutions: true, maxSolutions`
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
