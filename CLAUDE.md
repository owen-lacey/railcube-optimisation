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

**A pose is read from inside the train's cell: floor + heading.** The head — the state a
route has reached — is the cell the train is in once it has finished travelling a piece,
plus which face of that cell it stands on and which way it is going. Owen's call, over the
old rail-face-of-the-next-cube reading, because the train is always in a cell. So the
canonical pose is `DF`, the start cube is the origin and the train starts above it at
(0, 1, 0), and a piece is drawn and keyed at `cubeOf(cell, pose)`, the cube under the train.
It is an exact relabelling of the old `UF` scheme (floor = the old face's opposite, cell =
the old head plus one along that face), verified piece by piece over every layout and all
144 steps, so no geometry, collision or answer changed. Positions and poses are only ever
stated between pieces; mid-piece the train can be inside material (the inside curve's
hollow), and nothing is said about that.

## The model lives in `src/`

| File | |
|---|---|
| `src/track.js` | poses, the piece catalogue, `SCORES`, both hard constraints. The single source of truth — solver, tests and site all import it |
| `src/routes.js` | known-good routes |
| `src/enumerate.js` | brute-force DFS. The oracle the solver is checked against |
| `src/solver/` | the CP-SAT model, behind the `solveTrack` facade |

`site/` is the SvelteKit app, plus the components it draws with, developed in Storybook
(`.storybook/`, `npm run storybook`). Two routes: the front page is a solve viewer — the
28-cube sweep and a 1,000-layout sample of the crossed one (`site/src/lib/sweeps.js`),
shuffle for a random layout — and the draft blog post lives at `/post`, deliberately
unlinked from it. The crossed sweep itself outgrew a file the page imports whole and lives
in `sweeps.db` (below); the site carries a uniform sample of it. On narrow screens the
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
tool, on different terms — see the next two sections.

### The JS model on native CP-SAT: `engine: 'native'`

`solveTrack({ engine: 'native' })` (default `'wasm'`) solves **the JS model itself** on
native OR-Tools. `src/solver/native.js` sends the CpModelProto bytes cpsat-js would hand its
WASM to `src/solver/native.py` in a child process (`uv`), and reads the CpSolverResponse back
into cpsat-js's result shape. There is no second model to drift, which is what makes this
different from the deleted Python model: selectors, `report` and the `chainTrack` recount are
the same code on either engine. `optimise-metric.js` and `sweep-crossings.js` take
`--engine native`. Node only.

- **Pinned to OR-Tools 9.12**, the version cpsat-js is built from, so the engines differ only
  in WASM against native code. 9.12 is also the last Python wrapper that holds a plain
  protobuf; from 9.13 the bytes would need a text-format round trip. 9.15 measured no faster.
- **Measured on one proto, uncontended, 8 workers, median of 3:** 18-cube `SET` proved in
  5.1 s against 11.7 s; a crossed min10 rung's first layout in 42.5 s against 74.8 s; the
  `3x5x17` prove box refuted in 39.5 s against 61.6 s. So 1.6–2.4×. The bigger gain is the
  tail, which is far shorter: the rung ranged 21–47 s natively against 33–396 s.
  **14 workers was slower than 8** on both crossed questions.
- **`onSolution` is always live** natively, at any worker count, since the search is in
  another process. A throw from it kills the search and rejects the solve.
- About 0.27 s per solve is spent spawning `uv` and Python, which matters only for many tiny solves.
- It needs `cpsat-js/proto` (schemas plus the matching `toBinary`/`fromBinary`/`create`), added
  for this in cpsat-js 1.3.1.
- `tests/native.test.js` checks the engine against the oracle, and every metric objective in
  `tests/metric-objectives.test.js` runs on both engines.

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
arithmetically for reporting. (`--random` and `--objective` are the exceptions, below.) This is faster, not just simpler: the 18-cube `SET` goes from proving optimal
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

### Optimising the aesthetic metrics: `--objective`

The six readings in `src/metrics.js` (faces, volume, repeats, faceUp, ceiling, height) are
arrangement-reading terms, so unlike `SCORES` they are real questions under full spend.
ceiling is the steps ridden upside down (floor facing up); height is the train's up
coordinate summed over the steps. Both are counted over every step, revisits included,
like faceUp, and both are good when high — height's direction is provisional, Owen's call.
Each is an objective on both solvers: `OBJECTIVES` in `src/solver/index.js` (keyed by
metric name, plus `combined`) and `explore.py --objective`. `scripts/optimise-metric.js`
asks the crossed sweep's question with one, since explore.py cannot cross. The direction
is `SIGNS` in `src/metrics.js`, and it is not cosmetic:

- **faces and volume are sound in one direction only.** faces' `seen` booleans are
  claimed, never forced, so they are only right when maximised. The volume bounds are
  forced on, never off, so they are only right when minimised (`longestSide` too).
  `combined` respects this because its weights carry the same signs. Flip a direction
  and the answer is silently wrong.
- **repeats, faceUp, ceiling and height are exact both ways**, so their worst can be
  asked for: `solveTrack({ direction: 'worst' })`, `optimise-metric.js --direction worst`.
  faceUp and ceiling are plain sums of selectors, height a plain sum of the head's up
  coordinate, and none of the three adds a variable; repeats has one `trip` per (step,
  type), forced on by the triple and off by any one of its three missing. `direction`
  throws for anything else, and for a `combined` whose ranges name a one-way metric. Its
  shape is provisional, Owen's call.
- **The floor holds the train up as well as the material.** A train riding under a cube
  on the ground would be inside the ground, so with `minY` set the head's up domain
  starts at the floor (solver, oracle and explore.py alike); no piece books a train cell
  below both its heads, so that bounds the whole train. Without it the worst height
  goes underground. Owen's call, over measuring height from the lowest point: it is a
  smaller domain rather than an extra min variable. The sweep tooling (`check-route.js`
  `onTheGround`, `merge-sweeps.js`, `meet.py`) still checks material only, and ~2% of
  `sweeps.db` (224,136 rows) breaks the rule — also his call. `score-sweeps.js` counts
  those rows' `underground` steps and `rank-scores.js` leaves them out.
- **They need `fill`.** Left free in length, the best volume is a four-piece ring. The
  wrap would also read the switched-off tail as track. The JS throws
  without it; explore.py is always full spend.
- **Volume has no multiplication in cpsat-js**, so the JS takes a one-hot table of span
  triples (2,601 booleans at box 8). Native CP-SAT uses `add_multiplication_equality`.
- **`combined` is exact integers, over the metrics its ranges name.** `combinedWeights`
  multiplies through by the LCM of the ranges in one `POPULATION_RANGES` entry (13,734 /
  121,212 / 5,373), and a metric the entry leaves out weighs nothing. `sweep28` and
  `crossed` are the four-metric combination; `crossedCeilingHeight` (ceiling 0–27,
  height 27–226, over every floor-legal crossed row) is the pair the post weighs. Pick
  one with `--ranges`, on `optimise-metric.js` and explore.py. One entry per pair is
  provisional, Owen's call. Both runners recount the answer through the
  JS and exit nonzero if the solver's objective value disagrees, since that is an
  encoding bug.
- **faces saturates.** It is out of 6, and 6 is common: 47% of the 28-cube sweep and 29%
  of the crossed one already sit there. So a faces objective proves its optimum almost at
  once and picks out a large slice of the population rather than one layout. Owen chose
  it knowing that, over `poses`, whose only bound was "every pose".
- **repeats counts runs of three, not pairs**: the steps that start three of a kind in
  a row, wrapping, so a run of n costs n − 2 and `SS` is free. Owen's call, for more
  interesting layouts — the pair version's optimum forbade any two alike side by side.
  It saturates too: 56% of the 28-cube sweep and 20% of the crossed one score 0.

`tests/metric-objectives.test.js` checks every objective, on both solvers, against the
oracle's best over the 25 full-spend loops of a 14-cube, box-3 set. That is the one small
instance found where all four metrics vary (ceiling and height vary there too), and it
asks the two-way metrics and the pair's combination for their worst as well. The floor
has its own case: 4 S, 2 L, 2 R, 4 I, 4 O in box 3, the smallest found where a
material-only floor admits a loop with the train below it (`IOLSOSOLOSIRSIIR`, faceUp 5,
height 22), so the worst height with faceUp ≥ 5 is 22 without the rule and 24 with it.
(Asked for the worst, a limit holds a metric at least this *bad*, so the limit is
`{ faceUp: 5 }`.) The crossed-oracle cases are the slow tier,
over the 56 crossed 16-step loops of 6 S, 2 L, 3 R, 4 I and a cross in box 4: at 14
steps every crossed loop has exactly one run of three, so repeats cannot vary there.

**Proving an optimum: `limits`, `spans` and `--prove`.** The combined objective on the
crossed question stalls at FEASIBLE with a wide gap, because the incumbent is already best
on faces, repeats and faceUp, so the whole gap is volume — and volume's bound comes from
hi/lo edge bounds and a product, which is loose (a standalone volume solve: 210, bound 20).
So a proof is asked as many yes/no questions instead of one optimisation. JS only;
explore.py has neither option, accepted because the crossed question needs the JS model.

- **`limits`** holds metrics at least this good, each in its SIGNS direction (`combined`
  in `combinedWeights` integers, maximised). The terms are the objectives', so the same
  one-way soundness applies, and limits only ever bound them from their good side. Needs
  `fill`.
- **`spans`** (`[across, up, along]`) caps the material's extent, wherever it sits in the
  box. It also narrows the **region** the whole model is built over — head domains, claim
  grid and sentinels, material bounds, the volume table — to n − 1 either side of the
  origin (0..n − 1 up, on the floor), intersected with the box. Sound because the start
  cube is always material at the origin (checked for every piece and start pose). There
  is one region, derived once in `buildModel` from box, floor and spans; nothing past
  that reads the scalar box. Narrowing is not a global box reduction: a better layout
  can be 17 long, so it is sound only per question.
- **`scripts/optimise-metric.js --prove SHAPE --out FILE`** splits "is anything better?"
  into cases, one per value of faces, repeats and faceUp, each with the volume it leaves
  to spend (derived from `combinedWeights`, never by hand), and asks every largest box
  under that volume (`largestBoxes`, none inside another) with the case as `limits` plus
  `combined ≥ incumbent + 1`. PROVED means every box of every case came back INFEASIBLE;
  a FEASIBLE box is a better layout, recounted and made the incumbent. Every box is a
  line in `--out`, and a box held by one already refuted under limits asking no more is
  skipped, so it resumes and a refutation outlives a better incumbent.
- **The incumbent cannot help as a hint.** Every question demands strictly better, so the
  incumbent breaks it, and a hint never shrinks the space a refutation has to cover. Its
  useful form is the cutoff, `combined ≥ incumbent + 1`, which every question carries.

What moved the hard boxes, measured: the region alone did not — the 3-wide boxes were all
UNKNOWN at 120 s over the full ±8 model and still were over the narrowed one. The case
split did: `3x5x17` under repeats 0, faceUp ≤ 1 is INFEASIBLE in ~135–175 s.

### The crossed sweep is a ladder: `scripts/sweep-crossings.js --min-loop k`

A crossing splits a route into two loops, and `minLoopLength` bounds the smaller (null = no
bound; 6, the figure eight `XSLLLSX`, is the tightest there is, so anything ≤ 6 is a no-op).
Left free, the solver closes nearly every crossing the smallest way it is allowed: 32 of the
first 38 unconstrained layouts were the 6, and with 6 banned the pile-up moved to 8
(`SIRIRIS`/`SILILIS` were 548 of 1,306). Banning a size only moves the pile-up one rung, so
the sweep runs as a **ladder** — one concurrent process per `--min-loop k`, each to its own
`sweep-crossed-min{k}.jsonl`, with `--workers` split across them by hand.

- **A rung is "at least k", not "exactly k"** — Owen's call, over a `maxLoopLength` that
  would need a reified OR. Rungs can share shapes and a rung's file is not guaranteed pure.
- **Why not an objective**: a rung is a satisfiability solve, fast, with its no-good cuts
  kept to itself. And a linear penalty on both loop lengths is inert — they always sum to the
  route length; only `min(d, L − d)` or a threshold says anything.
- **The hint must satisfy the rung** or it is worse than none: the script picks a witness
  whose smaller loop is ≥ k, runs unhinted above 12, and refuses a `--hint` below k.
- The ladder controls loop *size*, not *shape*; rung 8 may still be mostly the two 8-motifs.

**Breaking the cyclic-shift symmetry by starting at the cross was built, measured and removed**
— Owen's call, not worth it. Pinning the cross's first pass to step 0 (`at[0] = 0`) leaves each
track two entries, one per pass. Measured over the 8,372 swept tracks, and worth knowing before
trying anything like it again:

- **The floor had already broken most of that symmetry.** The start piece is face-up with
  nothing below it, so a track averages **8.9** valid entries, not 36. That caps the gain.
- **Only 39% of tracks can be entered at their cross.** The cross must sit face-up on the floor
  and within the box measured from it, so a sweep pinned there can never find the other 61%. Small
  oracle instances never show this, because every crossing they make is on the floor.
- **It bought about 1.3×.** That was on rung min10, alone on a quiet machine at 6 workers, with the
  arms alternating over 3 runs of 20 solved layouts each. The median gap was 40.8 s pinned vs 54.4 s
  unpinned, time to 20 was 723–1,258 s vs 948–1,746 s, and the ranges overlap.

One side result: one rung alone ran at ~54 s a layout, against 168–218 s with the full ladder
running, but seven concurrent rungs still produced more layouts per hour in total.

### Crossed layouts without a solver: `scripts/meet.py`

`uv run scripts/meet.py --set '<inventory>' --box 8 --rounds 0 --out sweep-crossed-meet.jsonl`
is a meet-in-the-middle generator for the crossed question, and it outruns the ladder by orders
of magnitude. Seed 3 at 20k halves does a lobe-17 round in 2.8 s on one core — **690 verified
layouts in 10 s** — against 62–218 s per layout from `sweep-crossings.js`. Four workers
(separate `--out` files, one core each) sustain ~86 layouts/s together — which is what pushed
the crossed sweep out of a JSON file the front page imported whole and into `sweeps.db`. The
design choices are Owen's:

- **The route is read from the cross, `X · A · X · B`.** Both lobes run from the cross back to
  it, so each is a path between two fixed states and is itself a half-and-half join: four
  quarters. That makes the return to the X hold by construction rather than by luck, and it keeps
  crosses out of every half, so counts are cubes throughout. Reading from the other pass swaps
  the lobes and turns DL into DR, so drawing A no longer than B with both headings misses nothing.
- **Halves are grown forwards from DF and inverted**, so they are frame-free: one pool per
  half-length serves both lobes and both ends. The price is that a half cannot see the cross or
  the box while it grows, only its own claims and a span cap. Those are checked at the join.
- **Built in the cross's frame, then re-anchored.** The start piece is picked afterwards, by
  trying each piece until one reading puts its cube at the origin, entered in DF, with the floor
  and box satisfied. Pinning the
  cross as the start is the 39% narrowing above; this reaches every track.
- **Lobe lengths are sampled per round**, and `--min-loop k` bounds the shorter from below.

It is Python on the explore.py terms. Geometry is `export-geometry.js` on every run, which now
also exports `rotations` (from `poseLetters`) and `crossRevisits` (from `isRevisit`), and the
rotations must reproduce every transition row and cell entry before anything is built. Every
output goes through `check-route.js --stdin`, one node process for the whole run, and a
disagreement exits nonzero. Spawning one per shape cost ~0.17 s, which was most of the wall time
and a 12× slowdown. The collision rule is a port, of the `createClaims` verdict only.

`tests/meet.test.js` runs `--exhaustive` against `enumerateLoops` by `trackKey`, and it is the
first test that needs `uv`. `--exhaustive` emits no mirrors, so the oracle sees both headings
found on their own. What it does and does not catch was measured with mutants:

- **Dropping a heading** is caught in the fast tier.
- **Refusing to re-anchor** (the cross must start) is caught only by the 16-step slow test.
- **Treating shared train cells as a clash** is caught by nothing: no oracle-sized track shares a
  train cell across a join. That port is right by reading, not by test.
- A **false accept** of any kind is `check-route.js`'s job, not the oracle's.

One thing seen in the output, not yet acted on: **yield piles up on long lobes.** Rounds with A
of 15–17 give ~250 layouts each, A ≤ 9 gives almost none, and A ≤ 3 cannot close at all. So the
low ladder rungs are not served by uniform draws, and about half of a run's rounds are spent on
lengths that yield little.

### Sweep logs are a staging area: `scripts/merge-sweeps.js` → `sweeps.db`

The gitignored `sweep-*.jsonl` logs are where solves land; `sweeps.db` at the repo root is what
they add up to — SQLite via better-sqlite3, **gitignored too**, and since merging drains the logs
it is **the only copy** of every layout it holds: it cannot be rebuilt, so back it up. Two
tables: `questions` (the `questionOf` JSON, cubes, score) and `layouts`, one row per physical
track with a column for everything the geometry decides — spans across/up/along, volume,
revisits, `mirrored`, `loop_small`/`loop_large` (the two loops a crossing makes, so a ladder
rung is a `WHERE`), and provenance (`source_log`, `merged_at`). WAL mode, so it can be queried
from `sqlite3` while a watch writes. `site/src/lib/data/sweep-28.json` is frozen: nothing writes it
any more. `site/src/lib/data/sweep-crossed.json` is `scripts/sample-sweep.js --question 1
--count 1000 --seed 1`: a uniform draw of rows, each re-derived and its stored columns
compared before it is written. Uniform means skewed the way the database is — the first
sample held one layout at rung 8 and none at 6 — and since a watch keeps adding rows, the
same seed only reproduces the file against the same database.

`merge-sweeps.js` moves layouts from logs to the database: each record goes under the
**question** it answers (`questionOf` in `scripts/sweep-data.js`: inventory, steps, box, minY,
startPose — `minLoopLength`/`tightCrossings`/`exclude` are search knobs, so every rung merges
under one question), is re-verified through `chainTrack`, and is inserted only if the database
does not already hold it *as a physical track*. The one question in `sweeps.db` predates
the pose relabelling and says `startPose: "UF"`; sweeps now write `"DF"` for the same
physical start, so their records will not match it. Owen chose to leave the database as it
is, so merging a new sweep means `--new-question`. `--watch .` re-runs the pass whenever a
`sweep-crossed-*.jsonl` changes (run it in tmux beside the ladder); `--new-question` admits a
question the database lacks. Every duplicate is also appended, once per shape, to the gitignored
`sweep-duplicates.jsonl` — the tmux pane's scrollback will not last an overnight sweep.

**Every pass drains what it merges.** It claims a log by renaming it to `<log>.claimed` — every
sweep opens its log afresh for each append, so the next one starts a new file — waits a second
for an append in flight, merges the claim in one transaction, and deletes it only once that
commits. A record the geometry disagrees with, or a claim cut off part-way through a record,
stops the pass and keeps nothing from it; the claim stays on disk and is merged first next time,
before its live log is claimed again. A record for a question the database lacks is set aside in
`sweep-unmatched.jsonl` beside its log, which `--new-question` admits (and drains). Logs are read
a 16 MB chunk at a time, because a meet log outgrows the longest string V8 will make (~512 MB) —
that is what crashed the watch at 591 MB. Two things draining costs:

- **A shapeless record is gone once merged.** Misses carry no layout, so nothing keeps them —
  and `explore.py --resume` replays its seed stream from exactly those records. Merging an
  explore log ends its resumability.
- **A restarted sweep forgets what it found.** `meet.py` and `sweep-crossings.js` seed their
  dedupe from their own log at startup, so after a drain they re-find layouts the database
  already holds. Harmless — they merge as known — but it is wasted search.

**A gitignored database cannot be under `npm test`**, and a test that skipped when the file was
absent would be a silent skip. So the crossed sweep's checks — every row re-chained, every column
and track hash re-derived, box and floor, one crossing each, mirrors paired — are
`merge-sweeps.js --check`, which exits nonzero on any fault. It pays a key per row, so it is
minutes, and on demand. `tests/merge-sweeps.test.js` covers the code against throwaway
databases, audit included.

**`trackKey(shape)` in `src/layouts.js` is what "the same track" means.** The placed pieces —
type, material cells, train cells and heading — up to the 24 rotations and a translation, so a
route entered at a different piece (a cyclic shift) is caught wherever it lands in space. Two
things measured rather than assumed:

- **Driving a track backwards is not another reading of it.** Every piece would be entered
  through its male end; no L/R or I/O relabelling of a reversed string reproduces the build.
  That is why the heading is in the key.
- **A mirror is usually a different track, not always.** `eight` is achiral — its mirror is
  itself turned round — so a sweep's mirror pass on such a layout would be refused as a
  duplicate and break the mirror pairing that `merge-sweeps.js --check` audits. No swept layout is
  achiral yet; if one turns up, that is a decision for Owen, not something to paper over.

A crossed cross keys on *both* its passes' headings, because which pass comes first depends on
where the route starts. Keying costs ~3–7 ms a shape — which is why the database stores the key
hashed (`track_hash`, sha256, UNIQUE per question) rather than a merge re-keying every row it
holds, and why an exact-string match is checked first and pays nothing.

### Readings as columns: `scripts/hydrate-sweeps.js`

`sweeps.db` holds per-layout readings as columns, so a weighting can be asked of every
layout in SQL rather than of a scores file in a temp dir: `faces`, `repeats`, `poses`,
`close_calls`, `underground` (steps the train rides below the floor) and the two knot
readings `knot_over`/`knot_under`. The first five are `derive` columns in
`scripts/sweep-data.js`, so a merge writes them and `merge-sweeps.js --check` re-derives
them. They were added to the live database by hand with `ALTER TABLE` (backup:
`sweeps.db.backup-2026-10-05`), so its column order differs from `SCHEMA`'s; nothing reads
columns by position. `hydrate-sweeps.js --readings` / `--knots` fills the NULLs, by id
range, resuming by itself.

Two readings, both Owen's definitions, neither in `METRICS` (every `METRICS` name needs a
solver term):

- **`poses`** is how many of the 24 poses the train takes. Over every row 6–20, mean
  12.5; none reaches 24, which is why it is a count and not "all 24".
- **`close_calls`** counts distinct cells the train is in — booked train cells and the
  cells between pieces — that share a face with another piece's material. Not the piece
  being ridden, nor its route neighbours, which always touch at the joints; both passes of
  the cross are one piece. Over every row 0–27, mean 0.9, 62.7% zero; more is better.
  The inside curve's hollow is not counted.

**Knots** (`scripts/knot-curves.js` → `scripts/knots.py`, topoly on Python 3.11 via `uv`).
The curve is the rail, `trackPath` at 8 samples a piece. The real cross is flat, so the
second pass is bumped 2 units along its `up` × sin(πs), once over and once under; a track
is **knotted if either reading is** (Owen's call) and its type is unknot / trefoil /
figure-eight / `other:<poly>` by Alexander polynomial (`knotOf`). Both columns are kept raw
because re-reading costs ~60 ms a layout. Things learned:

- **A random rotation is required**: a grid-aligned projection gives `0`, which topoly reads
  as a link. The rotation is seeded by the row id and attempt, so a reading is reproducible.
- **`0` and `ErrTMC` are about the projection, not the curve.** Retried on a new rotation
  (up to 16), only a real polynomial is kept, and a curve that never gives one stops the run.
  ErrTMC is not only on unknots: a grid-snapped figure-eight gives it on ~half its rotations.
- **topoly can hang forever** on some rotations (native code, so nothing in-process can stop
  it): the first overnight scan lost ten hours with all twelve readers each stuck on one
  curve. knots.py now runs topoly in a worker process and kills it after `--timeout`
  seconds (10; `knotReader({ timeout })`), counting a hang like `0`/`ErrTMC` and moving
  on to a fresh rotation. `tests/knots.test.js` pins the track that hung. A scan that looks
  healthy in its first minutes can still stall later, so check a long one by rows read in
  the database over time, not by its first log lines.
- **Never both ways yet**: every knotted layout seen is knotted over or under, never both;
  `knotOf` throws if two different knots ever turn up.
- **Front first: `--knots --front`.** With every weight positive, a layout dominated by a
  knotted one can never be the best, so only the groups (layouts tied on the other metrics)
  no read knotted dominator rules out need reading, front inwards; the worst end is the same
  flipped, with an unknotted dominator ruling out (`scripts/knot-front.js`, checked against
  brute force over every weighting 1–5 in `tests/knot-front.test.js`). It covers both ends
  of two metric sets — poses, close calls, repeats and longest side, with and without
  faces — and is exact only for positive weights: a zero weight lets dominated layouts tie the best, and only the full
  `--knots` pass covers that. A wave is counted in unread layouts, not groups: counted in
  groups, a toy population read 92% of itself. Direction matters to the cost, not just the
  answer: with fewer close calls as better the front is the 0-close-call groups, thousands
  of layouts each, and it had read 13k a few groups in when it was stopped. More is better
  (Owen's call), and that front read in minutes.
- `--check` does not re-read knots (hours). `hydrate-sweeps.js --recheck N --seed S` re-reads N
  uniform rows and every knotted one on fresh rotations and exits nonzero on disagreement.
- `tests/knots.test.js` has positive controls (trefoil, figure-eight, grid-snapped copies,
  circle) and spawns `uv`, as does `tests/hydrate-sweeps.test.js`.

### The weighted best and worst: `scripts/tally-weights.js` → `WeightedTracks`

Five sliders, 0 to `maxWeight` (5): knotted, poses, close calls (more is better, all three),
repeats and longest side (fewer/shorter). `tally-weights.js` reads `sweeps.db`'s columns
and writes `site/src/lib/data/sweep-crossed-weights.json`: one row per distinct five values
over the legal rows (10,648), `knotted: null` for layouts whose knot is unread, and
`weighting.js` ranks the rows, so the ends are exact over all 11.1M. Examples are kept only
for rows that are an end under some slider setting (3,677 rows, 13k examples, 245 KB
gzipped), and every one is re-derived, its knot re-read on a fresh rotation.

Unread knots are reported, not guessed: an end says how many unread layouts could reach it.
That is none when every weight is positive (the front read, `tests/weighting.test.js` over
all 3,125 such settings) and none when knotted weighs 0, since then a knot cannot move a
score — those unread layouts simply tie, and are shown with "knot not read". Only knotted
positive with another weight at 0 can leave an end unsure, and the full `--knots` pass is
what closes that.

### cpsat-js bug (still present in 1.2.0): `notEquals` does nothing

`IntVar.notEquals` builds a constraint that is silently a no-op — two variables pinned to the same value still solve. `src/solver/index.js` uses a `differ` helper (a reified pair of strict inequalities) instead. `tests/library.test.js` asserts the bug still exists, so fixing the port will fail that test and point at the workaround to delete. `addAllDifferent` and `onlyEnforceIf` are fine, as are `addHint` and `onSolution`.

## Visualisation: three.js

Track layouts and the train are rendered with plain [three.js](https://threejs.org) behind
the imperative `stage.js` API — not Threlte, because the stage is imperative. It replaced
PolyCSS (a CSS 3D engine, one DOM element per polygon), which made `/post` unusable on a
phone: Chrome's Layerize step re-layerized every polygon leaf on every main-thread change.
The port held the pictures identical rather than improving them, and was checked against a
Storybook screenshot baseline taken on PolyCSS (below). The memories `threejs-migration-decision`
and `threejs-fidelity-spike` hold the measurements.

- **One renderer per page** (`renderer.js`). Browsers cap WebGL contexts at ~16, so one
  offscreen `WebGLRenderer` (antialiased, pixel ratio `min(dpr, 3)`, grown to the largest
  viewer) draws every viewer, and each viewer is a plain 2D `<canvas>` filled with
  `drawImage` **in the same call as the render** — left for later, the copy can read back
  blank. It is made on first draw, never at import: every page is prerendered.
- **Drawing is on demand.** Every write to the picture (a cube placed, an overlay set, the
  camera applied) calls `stage.invalidate()`. While the loop runs, its tick draws once at
  the end of the frame; idle, an invalidation asks for one frame. A still viewer is drawn
  once and then costs nothing — `tests/stage.test.js` counts the draws.
- **Pieces are `MeshLambertMaterial` with vertex colours** under the `LIGHT` rig
  (`AmbientLight` + `DirectionalLight` at `LIGHT.direction`). three's Lambert term is exactly
  what PolyCSS shaded (`base × (directional·max(0, n·L) + ambient) / π`, linear), measured
  black in a difference overlay. Moving a piece is one matrix write and the normals turn
  with it, so a piece is lit correctly in every orientation — mid-fall and mid-flight
  included, which PolyCSS could not do.
- **The driven train's lighting is carried** — Owen's call, to keep the picture. Its colours
  are pre-shaded at its authored pose by `carriedShade` (the same formula, in JS) and it is
  drawn with an unlit `MeshBasicMaterial`, so it never re-lights on a bank or a wall. An
  untinted ghost train is lit live, since it stands still.
- **Overlays** (lattice prisms, train-cell fill, filled cells, tinted ghosts, origin axes)
  are flat `MeshBasicMaterial`s whose colours `readTheme` reads off the viewer's computed
  style (`--grid-color`, `--grid-opacity`, `--ghost-before/after`, `--ghost-opacity`), so the
  theme stays in CSS. The see-through ones are `transparent`, `depthWrite: false`, drawn after
  the solids in the order lattice → ghosts → fill by `renderOrder`; that matched PolyCSS to
  the pixel. The lattice stays prisms (`gridLines`), not `LineSegments`, which are one pixel
  wide at any zoom. Overlay meshes carry `OVERLAY` names so tests can find them.
- **The blueprint** (`blueprint` prop: on by default in `LayoutViewer`, off in
  `TrackViewer`, so piece cards never get it) is a sheet of isometric dots behind a
  viewer, edge to edge, so it is plain where the handle-able area begins and ends. It is
  a CSS background on `TrackViewer`, not in the scene: `stage.backdrop()` (`backdropOf`
  in `blueprint.js`) gives the spacing — a cell's edge at the applied zoom — and the
  canvas pixel one dot is pinned to, the frame's own target, so it follows zoom and pan
  and ignores the orbit. A floor of dots fixed to the world was built first and replaced
  on Owen's call: side-on it is a line, so the view most in need of a boundary had none.
- **One difference from PolyCSS is a correction**: a ghost inside a filled cell has the
  fill's near face drawn over it where the face really is nearer (the pose cycle's
  upside-down poses), which PolyCSS's depth sorting got wrong.
- **Axis labels** are HTML placed by `originTips()`, which projects each label spot through
  the camera (`Vector3.project`) onto the canvas's client rect.
- three r186 only refreshes a world matrix whose `matrixWorldNeedsUpdate` is set (the
  scene's own auto-update happens to force it every render). Meshes with hand-set matrices
  set it on every write, and need `updateWorldMatrix`/`scene.updateMatrixWorld()` before
  anything like `Box3.setFromObject` reads them.

**The renderer lives in the site** — `site/src/lib/render/`, split into `dimensions.js`
(measurements), `vec.js` (the project → world axis map and pose rotations), `pieces.js`
(one geometry generator per piece type), `rail.js` (where the rail runs, plus the
`assertRailMouths` check that runs at import) and `train.js` (the lofted body). Each emits
polygon lists, `{ vertices, color }`, wound so the outward normal follows the right-hand
rule (three's front face; everything is single-sided).

Five shared bindings sit on those: `camera.js` (the camera below), `meshes.js`
(`soupGeometry` — polygons → a non-indexed `BufferGeometry` with face normals and linear
vertex colours, fan-triangulated, so a concave polygon must be split — plus the shared
per-type geometry cache and `movingMesh`), `renderer.js`, `loop.js` (an rAF loop with its
own clock) and `drive.js` (the train's motion along a route).

**`stage.js` sits on all of them, and everything that draws goes through it.** It owns the
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
Seven components sit on top, in `site/src/lib/components/`: `TrackViewer.svelte` (mounts
the canvas, owns the stage and the intersection/resize observers), `PieceViewer.svelte` (a piece
type, alone or in all 24 poses), `LayoutViewer.svelte` (a shape string), `SketchViewer.svelte`
(a text box the track is typed into), `TrackBuilder.svelte` (buttons the track is clicked
together with), `TumbleViewer.svelte` and `BuildViewer.svelte`. The stories are plain JS CSF
files beside them.

`TrackViewer` mounts a stage one way and shows a layout four, chosen by one `transition`
object, `{ kind, ...that kind's settings }`, and looked up in its `CHANGES` table, which is
why the wrappers stay thin rather than becoming copies of the plumbing. `redraw`: new pieces
are a redraw off an emptied stage. `build`: they are assembled from off the frame. `tumble`:
they are a rearrangement — the old layout collapses and the new one is built out of what
falls. `grow`: they are an *extension* — whatever the two layouts have in common is left
standing, untouched, and only the rest arrives. A tumble is the only kind that imports
`tumble.js`: that module reaches `cannon-es`, so it is loaded dynamically on mount, which
keeps a physics engine out of a page of static piece cards — and out of `Sketch`, which
never drops anything. The train is a `train` object of callbacks (`at`, `onAt`, `onCell`,
`onPose`) or null for none, and handling is a `controls` callback or null — Owen prefers
objects and callbacks to boolean props.

`LayoutViewer` is a viewing pane and a caption: a `scene` factory (`layoutScene`, `cellScene`,
`axesScene` in `scenes.js`), the `transition`, `train` and `controls` it forwards, and a
`caption` snippet given the scene, rendered as `LayoutCard`'s footer. Every figure the post
uses is its own entry component over it — `TrackFigure`, `TrainCoordinates` (which owns the
train's state and puts `TrainScrubber` in the caption), `KnownTracks` — so the post never
configures a viewer directly.

**Whether the layout changed cannot be answered by identity, and getting that wrong is not
a wasted redraw.** `TrackViewer` keys on `type`+`pose`+`cell` per piece (`keyOf`). The mount
draws once and the `$effect` then fires with the very same pieces, and a `$derived` upstream
is free to hand over an equal-but-new array — either of which, compared by reference, reads
as a shape change. In sequencing mode that means the track knocking itself down for no
reason, which is exactly what the first render did until it was caught in a browser.

### Scrollytelling: `ScrollySection`

The post opens on a `ScrollySection` (scrollama): one viewer in a box stuck to the top of the
screen, and the prose running through a fixed band below it, each paragraph changing what the
box shows as it arrives. A step is `{ body, figure, props }` — a snippet of prose, and a figure
component with its own props.

**A figure is the same component standalone or as a step** — Owen's call: being usable as a
step must not change how a figure is written in the post, so nothing wraps one. The contract is
`$lib/figure.js`. Figures (`TrackFigure`, `TrainCoordinates`, `KnownTracks`) draw through
`Frame`, handing it a `view` (shape, scene, train, paused) and a `footer`. With no host, `Frame`
is its own card and viewer. Under a `FigureHost` (context), it hands `show(view, hasFooter)` to
the section and renders only its footer.

- **One viewer per section, never remounted.** A step change swaps the footer, redraws the track
  in place, and pans the camera to the new step's tight frame (`transition: { kind: 'redraw',
  pan: 0.6 }`). A pan picks up from wherever the camera has got to, so a step change mid-pan
  turns towards the new frame. A bigger track is drawn at the old zoom and panned out, so it
  starts cropped for ~0.6 s. That was accepted.
- **`TrackViewer` re-shows on a new `train`**, even over the same pieces, because train
  callbacks are captured in `show()`. Without it a section's next step would drive the
  previous figure's train.
- **The card is one size for every step.** A footer is a fixed `FOOTER` (6.5rem). A figure with
  no footer has no bar, and the viewer takes the whole card.
- **The box only loads where it sticks if the section is the page's first child.** The
  `main:has(> .scrolly:first-child)` rule in `site/src/routes/+layout.svelte` drops the
  layout's top padding for it. That is why `/post` has no title — Owen's call.
- Steps trigger at the middle of the band, measured in pixels off the stage
  (`scroller.offset(...)`, scrollama 3.2's name for `offsetTrigger`), because a phone's address
  bar changes the viewport but not the stage. The last step releases the box, so the page reads
  normally after it.
- Synchronous `scrollTo` jumps do not fire scrollama. A CDP check has to scroll a little at a
  time.

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
or drawing the legal prefix: the overlap is the explanation. It is not `Sketch`'s alone:
`TrackViewer` takes it as an `alarm` prop (a cube ID), so `Layout` pulses too, whatever
its transition. Four things about it:

- The pulse is `restyle` on **one** cube about twice a second: a swap to that colour's
  shared geometry and to a material, so nothing is rebuilt.
- **What it hit shows through it.** The two pieces share faces exactly, and left to the
  depth buffer that is z-fighting — stripes of both. So once down, the rejected piece is
  drawn as a `clash`: swollen by `ALARM_SWELL` about the middle of its bounds, so no face
  is shared, and see-through at `ALARM_OPACITY` (`paint.clash` in `stage.js`), so the
  colours blend. Owen's call, over a `polygonOffset` that took the cell in turns: that
  left small red patches showing through the other piece's rail, which read as strange.
- It is `alarmFor` in `build.js`, run by `trackPhase`, `buildPhase` and `growPhase` each
  rather than by a phase of its own, so that exactly one thing ever writes to a cube in a
  frame — the same rule `onPickUp` exists to protect. Because any viewer can be handed one,
  every `TrackViewer` gates its loop on being on screen, not only one that animates at mount.
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
panning, and the rejected piece is a steady see-through red rather than a pulsing one — a pulsing element
is precisely what that preference is about.

**Taking a piece off slides it back out.** `showGrown` does not `drop` the cubes past the
common prefix; it `stage.detach`es them and hands them to `growPhase` as `leaving`, which
plays the arrival in reverse — back along the heading to the `STANDOFF`, the tilt returning
over the last 60% — and disposes each at the end, or at once if the phase is replaced first.
Nothing new arrives until the way is clear. `detach` frees the ID *immediately*: a piece
removed and put straight back would otherwise find the departing cube still holding its ID,
take it for one already standing, and strand it mid-slide. Under reduced motion they go at
once.

**A piece still arriving when the next change lands carries on home.** `growPhase` used to
treat any cube on the stage as standing, so a second letter (or click) inside a flight left
the first piece frozen in mid-air — a bug in `Sketch` too, just rarer at typing speed. A cube
on the stage but not exactly at its slot now finishes from where it got to.

### Clicking a track together: `TrackBuilder`

`Sketch` with buttons for a keyboard: six letter buttons in the pieces' colours and a
backspace (Lucide's `delete` icon, from `@lucide/svelte`), over `TrackViewer` with a grow
transition and `attachControls`, and no caption. It also takes the six letters, the arrows as a d-pad
(↑ straight, ← left curve, → right curve) and Backspace, with no click needed: `keys.js`
gives the page's keys to whichever registered builder has the largest share of itself in
view, if that is more than half — otherwise nobody has them and the arrows scroll the page.
Keys typed into an input, textarea or select are left alone. Adding goes dead while the track is stuck, since nothing
after a rejected piece could be built, and once the loop closes, since a finished track
takes no more. What it does differently is the
camera: it starts wide (`BUILD_FLOOR`, passed as `from`, seeds `growBox` in place of the
sketch's tight floor, and still only grows), and it can be handled. Square on a phone,
16/10 otherwise, unless `aspect` is given. It is in Storybook only; where it goes in the
post is Owen's call.

### Handling a viewer: `render/controls.js`

`controls={attachControls}` means `attachControls(host, stage)`, on `@use-gesture/vanilla`: one-pointer
drag orbits, pinch or wheel zooms, two fingers or a right-/shift-drag pans. A pan is
measured in `stage.zoom()`, the zoom actually applied.

**The hand-moved camera is an adjustment, not a camera.** `camera.js` holds a `view`
(`{ rotX, rotY, zoomBy, offset }`) and composes it over the description in `applyCamera`
(`adjusted`): rotation absolute, zoom a multiple of the frame's, target offset. So the stage
can reframe as it likes and the turn, zoom and pan survive. The defaults are `CAMERA` in `camera.js`.
Once the view is touched, `TrackViewer` shows a reset button: `stage.reset()` eases the view
back to `untouched()` over `HOME` (turning the short way round, zoom by ratio), re-reading
the description each frame, and then drops it to null. It runs while paused, a gesture
cancels it, and under reduced motion it is instant.

**A camera description is still PolyCSS's `{ zoom, target, 'rot-x', 'rot-y' }`**, kept
exactly so every camera in `scenes.js` frames the same shot. `polyView` puts an
`OrthographicCamera` there: the direction towards the viewer is `(sin rotX·cos rotY,
sin rotX·sin rotY, cos rotX)` in right/forwards/up (rot-x 0 straight down, 90 side-on,
rot-y −45 the default), and one world unit is the *applied* zoom in CSS pixels —
`zoom × min(width, height × 900/700)/900 × 0.88`, the old 900×700 calibration. The
orientation is written down (screen right `(−sin rotY, cos rotY, 0)`) rather than got from
`lookAt`, which is degenerate straight down — a tilt the controls can reach. `applied()` is
the description with the applied zoom.

The pan (`slid`) is along the ground, the camera's projection inverted, and
`tests/controls.test.js` checks it by projecting through a real three camera at several
tilts (0 included), turns and zooms, rather than against the reasoning.

use-gesture decides at *module load* whether it is on a touchscreen, and only then does
pinch listen to touch. So a CDP check of pinch must enable touch emulation before navigating;
enabled afterwards, a two-finger gesture just orbits. Verified that way on a 390px emulated
phone: pinch zooms, two fingers pan, one orbits, and a tap adds a piece.

**A shape string is always re-derived through `chainTrack`**, in `LayoutViewer` as it was on
the old `/view` page, and in `TumbleViewer` and `BuildViewer` after it: the chain throws
unless the route closes and nothing collides, so an illegal string gets the model's own
objection rendered as text rather than a drawing of nonsense. `Layout/Not a legal track` is
that path under test by eye.

**A cube is moved by `place(basis, position)` and nothing else** — one matrix write. Under
PolyCSS there were two ways (`bake` into the vertices, `place` on the container) and a
dance of re-lighting on landing, on pick-up and on settling; all of it went with the port,
because three rotates the normals. Only the train's lighting is carried, and on purpose.

**A build animation is a tween, not the tumbler backwards.** A rigid-body simulation is not
reversible — a pile does not know which of the many tracks that collapse into it was the one
— so `build.js` touches neither cannon nor `physics.js`. What it borrows is `meshes.js`.
Pieces arrive one at a time in route order (`chainTrack`'s order is the order they click
together); the arc is easings on legs of the offset rather than any control points; the train
sets off once the loop closes, which with two kinds of arrival is the *last* landing rather
than simply the last piece.

**Geometry is authored about the piece's cube, always** — `cubePosition` in `vec.js`, the cube
under the train's cell, since a piece's `cell` is the train's. Every mesh in the project
agrees on that, and a mesh turns about its geometry origin. Anything wanting to move a piece about its **centre of
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
only while there is a lattice. It is one mesh, moved by its matrix on each new cell and
never remounted. It follows the body rather than the booked train cells, and
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
scope of everything below is a tumble, and the difference is what is happening on
screen. A rearrangement replaces the whole shape at once, so a derived frame moves every
time you type and moves *while eighteen cubes are collapsing*. A sketch only ever extends,
so a grow-only box converges and then holds. Attempt 2 below was rejected for `Layout` and
is right for `Sketch`; that is not a contradiction, and do not "fix" either to match the
other. That is
`fixedFrame` in `scenes.js`: a box reaching `REACH` = 6 cells around the start cell, from the
ground up. `TrackViewer` applies it once at mount and nothing touches it again — the framing
effect deliberately reads neither `pieces` nor `camera` for a tumble, so a shape change
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
is also why a tumble is opt-in: a static figure is a redraw and gets the tight per-layout
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

`tests/stage.test.js` drives the real modules on a real three `Scene` and fakes only the
renderer (a `draw` that counts), with a hand-cranked `requestAnimationFrame` stepped in 16 ms
ticks that holds every frame asked for. Every mesh is watched from `childadded`: its mounting
transform, each matrix write after it (`setPosition` ends a placement, `makeTranslation` is an
overlay's move) and its `childremoved`. No DOM or WebGL, and `three` and `cannon-es` are
runtime dependencies, so it is in the fast tier.

It is the promotion of a throwaway script that had been written and deleted twice. Worth
keeping because *four* of its assertions failed when first written and three of the four were
the assertion being wrong, not the code. It asserts, beyond the geometry: that a picked-up
cube is the *same mesh* it was before it fell and was never removed; that a cube with no slot
receives no writes at all; that no train is ever abandoned; and that a still track is drawn
exactly once. A **marker phase** slotted between the two real ones is what makes the ordering
assertions exact rather than a guess at a time — and being able to slot one in is the
sequencing itself under test.

The growing viewer is in there too, and its first assertion is the one that matters: **a
cube already standing receives no writes when the next letter is typed** — no matrix write,
no geometry swap, not removed and remade. "It does not twitch" is a claim about writes
rather than pixels, which is exactly what watching the meshes can settle and the eye cannot. Beside it: a backspace slides exactly one cube back out along
its heading and then disposes it, leaving the others the same handles with no writes; a piece
put back mid-departure is a fresh cube; a piece still arriving when the next is added lands; there is no train until the route closes and exactly one
after; the rejected piece is the *only* mesh ever repainted, about twice a second; and a
stuck track keeps asking for frames while a settled open one stops.

Three bugs the unit tests did not catch, all found by driving Storybook in a real browser
over CDP, which is worth doing for anything in this area:

- **The first render tumbled itself.** `onMount` draws, then the `$effect` fires with the same
  pieces; a truthiness check on "is there something to knock down" saw a shape change. Fixed
  by `keyOf` above. Unreachable from `tests/stage.test.js`, because it is Svelte's effect graph.
- **Every replaced phase abandoned its train**, leaving it hanging in mid-air over the
  wreckage. Phases now have `dispose`, and the stage calls it on a phase it drops. *This* one
  is now under test.
- **A paste that replaced rather than lengthened kept letters the track did not have.** The
  input held `LLLLLSSSSSSSS` while the caption and the scene both stopped at `LLLLL`, so
  eight backspaces did nothing visible. The truncation rule in `clean()` is the fix, and it
  is simpler than the guard it replaced. Invisible to the unit tests because it is the
  component's input handling rather than the renderer.

**How a basis goes onto a mesh is under test** — `tests/rotation.test.js` places a mesh
at each of the 24 poses and 2,000 random orientations and sends its local axes through the
world matrix the renderer would use, rather than trusting the reasoning in `meshes.js`. It is
the one piece of the renderer where a wrong sign yields a thoroughly plausible wrong animation.

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
collecting `Runtime.exceptionThrown`. A viewer's pixels can be sampled by `drawImage`-ing its
canvas into a probe canvas and reading `getImageData`.

**That is also the renderer's regression baseline.** Before the three.js port, every story in
`/index.json` was screenshotted at 900×700 under `Emulation.setEmulatedMedia`
`prefers-reduced-motion: reduce` (every viewer then draws finished, via `trackPhase`), and the
port was diffed against it: opaque differences were edges only. Anything that changes the
renderer should be diffed the same way, before and after. Driven trains, falling piles and
`Known tracks` (a random pick) differ by timing, not rendering, so compare those by eye, and
compare translucent overlays side by side rather than by difference.

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
