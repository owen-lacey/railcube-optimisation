# Handoff: a browser-sized set, defined once

## Starting Prompt

The interactive blog post needs to run the solver **in the browser**, and Owen's real
36-cube set is too big for that. Last session established the ceiling empirically: the
36-cube model needs 63 s under native OR-Tools on 14 cores, 342 s under cpsat-js in
Node with 8 workers, and the browser gets **neither** — the portable cpsat-js build
clamps to a single worker, and Python isn't available at all. So the blog post needs a
smaller canonical set, chosen by measurement rather than by guess.

Three pieces of work, in this order:

1. **Pick the set by measuring, under the build the browser actually uses.** Do not
   benchmark in Node with default workers — 8-worker Node timings flatter the browser
   case badly. Measure with `numWorkers: 1`, which is what the portable build gives you.
   Sweep candidate set sizes and report solve time for each so Owen can pick the
   trade-off. Bear in mind `crossings` is documented as the most expensive part of the
   model (`src/solver/index.js:483`), so "does the small set include a cross" is a real
   cost decision, not just a flavour one.

2. **One definition of "the set".** `OWENS_SET` already lives in `src/track.js`, but
   which set is in play is currently threaded around as a **string name**:
   `src/layouts.js` records `set: 'OWENS_SET'`, `scripts/export-model.js` exports a
   `sets` map, and `python/solve.py --set` resolves by name. That indirection is the
   duplication to kill — the app should resolve the set from one export in
   `src/track.js`, not by string lookup. Keep `STARTER`/`DELUXE` as product facts;
   the tests depend on them.

3. **Two changes Owen already decided** (see Key Context) — the weighted objective and
   removing `optionalSteps`.

Start by reading `docs/pieces.md` open question 7 and the `crossed`/`owen` entries in
`src/layouts.js`, then propose candidate set sizes before measuring anything.

## Relevant Files

- `src/track.js` — `STARTER`, `DELUXE`, `OWENS_SET` (lines 261-280). Where the new
  canonical set belongs. `OWENS_SET` is derived from `STARTER` rather than restated,
  deliberately; keep that discipline.
- `src/layouts.js` — every entry carries `set: '<NAME>'` as a string. This is the
  main site of the string-name indirection to remove. Also holds the two 36-cube
  results whose notes need the box findings below.
- `src/solver/index.js` — `optionalSteps` (lines 53, 362, 377, 432), the `OBJECTIVES`
  table (line 70) where weights go, and `numWorkers` (line 508).
- `src/enumerate.js` — already supports up-to-N via `minPieces`/`maxPieces`
  (lines 77, 106). The `optionalSteps` removal needs call-site changes, not new oracle
  logic.
- `scripts/check-route.js` — verify every route the solver produces through
  `src/track.js`. Used throughout last session; it caught nothing wrong, which is
  why it stays.
- `python/solve.py` — still useful for proving things offline, but it is now
  explicitly **not** the blog-post path. Don't let the browser model drift from it.

## Key Context

**Box size is not a constraint worth tuning — settled last session.** Three runs at
37 steps with a mandated crossing, all `UNKNOWN`: box 6 at 3600 s, box 7 at 1800 s,
box 8 at 1800 s. And at 36 steps, boxes 6/7/8 all proved **35 cubes optimal**
(63 s / 126 s / 17 s — note the non-monotonicity, that's CP-SAT portfolio luck, don't
read trends into single timings). Two conclusions: box 6 was never binding, and
enlarging the box neither finds better answers nor makes the search tractable. Owen's
decision is to keep the box small. Also worth recording: the `owen` layout's 13×7×10
span *saturates* box 6 on one axis, which looked like evidence the box was binding —
it wasn't. Given more room the solutions got more compact, not less.

**The 37-step question stays open and is now parked.** Whether 36 cubes and a crossing
can coexist is unresolved in both directions — never found, never refuted. It needs a
37-step route. The likely cause of the UNKNOWNs is that forcing all 37 steps on leaves
the solver no partial credit to hill-climb on. If it's ever revisited, the move is a
smaller encoding (the boolean occupancy grid named in `tests/clearance.test.js`), not
a longer cap. This is *not* blocking the blog post.

**Weighted objective — decided, not implemented.** Replace "maximise cubes placed"
with per-piece scores: **straights 1, interesting pieces (curves and the cross) 2**.
Owen intends to fine-tune these, so they must live in **one easily-edited table**, not
scattered through the model. He explicitly considered and **rejected** weighting
straights 0 or negative — all-positive weights are the intent. Be aware of the
consequence he accepted: since inventory is only a cap, all-positive weights mean the
solver still crams in every piece that fits, so the weights mostly decide *which*
pieces lose when something must be dropped.

**`optionalSteps` goes away entirely — decided, not implemented.** Not a flipped
default; removed. The step budget becomes an upper bound always, used steps a
contiguous prefix. The knock-on to handle properly rather than work around: ~10
`allSolutions` enumeration sites (`tests/solver.test.js`, `collisions`, `clearance`,
`inventory`, `cross`) currently rely on `optionalSteps: false` meaning "loops of
*exactly* N", checked against the DFS oracle. Since `enumerate.js` already does
up-to-N, this is call-site work — but every one of those tests changes what it
asserts, so change them deliberately and don't let a silently-weakened constraint
through. That tier is what caught a real unenforced-constraint bug before.

**Two questions left open for Owen, deliberately not decided.**

1. *What counts as "small enough"?* Nobody has measured single-worker browser timings
   at any set size, so step 1 is written as a measurement task rather than a target.
   Owen has not said whether interactive means a second or two, or whether ten
   seconds behind a spinner is acceptable. Ask before optimising for the wrong number.
2. *How strict is "one definition"?* Read here as killing the string-name indirection
   while keeping `STARTER`/`DELUXE` as product facts. Owen has not confirmed that
   reading.

**Nothing is committed.** Everything from the last two sessions is uncommitted working
tree — 11 modified files plus untracked `python/`, `scripts/check-route.js`,
`scripts/export-model.js`. `npm test` passed clean at last check (116 pass, 15 skipped
without `SLOW=1`). The fast tier is now ~68 s, not the ~35 s documented in `CLAUDE.md`.
