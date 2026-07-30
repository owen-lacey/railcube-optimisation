# Handoff: the live-solving prototype is done — what's open now is the tie-break

## Starting Prompt

Both things the last handoff asked for are done and committed: `cpsat-js` gained
`addHint`/`onSolution`/`enumerateAllSolutions` (1.2.0, then 1.3.0), `solveTrack` exposes
`hint` and `onSolution`, and `spikes/track-piece/index.html?scene=solve` runs it live in
a Web Worker. That part of the prototype turned out to want a second iteration once it
was actually watched: an *optimising* live search (`objective: 'maximiseScore'`) is
exciting for a few incumbents and then just sits there converging, so the scene was
reworked into a live *enumeration* instead — a stream of distinct, equally-good full
layouts, one roughly every 2-3 s, for as long as `maxSolutions` says. See CLAUDE.md's
PolyCSS section for the mechanism and the two things that were tried and rejected on the
way there (`enumerateAllSolutions` can't be capped by count; dropping `fill` makes it
slower *and* less interesting to watch, not faster).

There is no assigned next task. The open thread, raised but explicitly not decided last
session, is still open: **is a tie-break term for the enumerated layouts wanted, and if
so which one?** Now that the enumeration actually runs live and fast (16 cubes, not the
40-in-154s pre-baked sweep the idea started from), the question is no longer abstract —
Owen can watch the stream and decide whether "every layout ties on score" is fine as
degenerate variety, or whether some layouts are visibly nicer (faces touched, span,
inversions — `scripts/benchmark-sets.js` already computes these) and worth surfacing
first. Don't decide this without him; it's exactly the kind of design call this repo's
rules reserve for Owen.

## Relevant Files

- `spikes/track-piece/solve-worker.js` — the live enumeration. `INVENTORY` (16 cubes,
  4 of every curve, no straights) and `MAX_SOLUTIONS` (50) are both named constants at
  the top, deliberately easy to change if the pace or set is wrong for the blog post.
- `spikes/track-piece/index.html` — the `?scene=solve` HUD, now reporting "layout N of
  `MAX_SOLUTIONS`" rather than a score-vs-bound convergence line, because there is no
  objective to converge. `?hint=` is gone; it belonged to the optimising search this
  scene no longer runs.
- `src/solver/index.js` — `solveTrack`'s `allSolutions`/`maxSolutions` path (the no-good
  cut loop) is what the live scene actually uses, not `enumerateAllSolutions` (see Key
  Context). `hint`/`onSolution` are still there and still used by anything that solves
  with an objective — `tests/hint.test.js` and `tests/callback.test.js` cover both.
- `scripts/benchmark-sets.js` — already computes faces/span/climb/inversion/turn-share
  per layout, the candidate vocabulary for a tie-break term if one gets picked.
- `vite.config.js` — new. Required because `?scene=solve`'s worker imports the bare
  specifier `cpsat-js`, which only a bundler-aware dev server can resolve. `npm run
  spike` replaces the old `python3 -m http.server` instructions.

## Key Context

**`enumerateAllSolutions` and `allSolutions`+`maxSolutions` are not interchangeable, and
picking the wrong one cost real measuring time this session.** `enumerateAllSolutions`
is a single `solve()` call that streams every solution of one search — cpsat-js's own
docs say the `onSolution` return value is ignored and nothing can stop that search
early, only `maxTimeInSeconds` bounds it. `allSolutions`+`maxSolutions` re-solves with a
no-good cut per round from plain JS, so it can stop at an exact count —
`tests/callback.test.js` already proved this (`maxSolutions: 3` → exactly 3 calls). For
"a handful of solutions, then stop," only the second one actually does that.

**Without an objective, the inventory size is what decides speed — not `fill`, not
`symmetryBreaking`, not box size.** Measured on the browser's build, `allSolutions` +
`fill: true` against the model's real 18-cube `SET` took 16 s for the first solution and
~26-28 s per round after — worse than the *optimising* search's 2.4 s first-incumbent.
Dropping just the two straights (18 → 16 cubes, otherwise identical) brought that to
~2-3 s per round, climbing only slowly as no-good cuts accumulate (45 solutions in
118 s). Two curve counts below 4 apiece were tried and came back `INFEASIBLE` in under a
second — consistent with the standing note that four of one handedness is the
geometric floor a loop can close at.

**`fill: true` is the better choice here, not a necessary evil.** The instinct that
*not* forcing full-inventory spend would enumerate faster was tested and is backwards:
without `fill`, CP-SAT reaches for the cheapest satisfying assignment first — a 4-piece
ring, twice, dropping 12 of 16 cubes — and only grows the loop by a cube or two per
no-good cut after that. It was both slower per round (irregular, 3-8 s) and a worse
thing to watch (a slow crawl up in size, rather than a stream of full, distinct
16-cube layouts).

**Everything from this session and the one before it is committed on `main`.** Working
tree was clean before this handoff except for one throwaway root-level probe script
(`tmp-jitter.mjs`, testing the random-weight tie-break idea CLAUDE.md already documents
as a dead end), now deleted rather than committed.

**Full-inventory ties are proven live now, not just argued from the objective's shape.**
Every layout the live scene draws scores the same (32, for the 16-cube set) — direct,
repeated confirmation of the `SCORES`-is-inert-at-full-inventory finding, seen this time
as an actual behaviour rather than an algebraic argument.
