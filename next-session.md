# Handoff: the crossroad piece

## Starting Prompt

Investigate the **cross** (the crossroad piece) in the Rail Cube model. It is the only piece
whose modelling is finished but unproven, and the only one with an open physical question.
Owen drives the direction — lay out what you find, flag knock-on effects, don't pick for him.

Three things are known to be true, and one is known to be missing.

**Known.** A cross is one cube with two rails on one face. The train can pass over it twice,
so it appears in a route twice but is one cube out of the box. The second pass is a
`revisit`: it claims no material and no clearance. `chainTrack` in `src/track.js` works out
which passes are revisits from the geometry alone — same cell, same face, headings on
different axes — so a route cannot claim a revisit it has not earned. The solver encodes the
same rule as explicit pairing in `addCrossings` (`src/solver/index.js`), and it both accepts
a pinned crossing and discovers one unprompted.

**Missing: there is no oracle for crossings.** `src/enumerate.js` says so in its own header —
it treats a cross as a plain straight that costs a cross. Asked for twelve-piece loops with
one cross available it returns **0**, while `chainTrack` happily accepts `XSLLLSXSRRRS`.
Every other rung is cross-checked against that brute-force enumerator; rung 8 is the one
that is not. Until the oracle can represent a revisit, "the solver finds all the crossing
layouts" is untested — only "the ones it finds are legal" is.

Start there: teach `src/enumerate.js` the revisit rule, then cross-check the solver against
it at small sizes the way `tests/collisions.test.js` and `tests/inventory.test.js` already
do.

## Relevant Files

- `src/track.js` — `isRevisit` and `chainTrack` (revisit detection from geometry),
  `countPieces` vs `countPools` (cubes vs traversal). `MOVES.cross` has `train: [{U:1}]` —
  one shared clearance cell for both passes.
- `src/enumerate.js` — the oracle. Its header states the limitation; `claim`/`release` and
  `descend` are where a revisit rule would go.
- `src/solver/index.js` — `addCrossings` (the pairing), `claimSlots` (slot 0 subtracts
  `revisit`), `addInventory` (cross pool minus revisits), `OBJECTIVES.minimiseDropped`
  (cubes, not steps).
- `tests/cross.test.js` — 13 tests. Note which are `slow`.
- `docs/pieces.md` — open question 7, still open.
- `docs/coordinates.md` — "What the train needs" (why the cross claims one cell, not two)
  and "What the solver says".
- `spikes/track-piece/index.html` — `crossCube` geometry, and `?scene=solved:eight` renders
  a figure of eight through one cross.

## Key Context

- **`docs/pieces.md` open question 7 is the live physical one:** do the cross's two rails sit
  at the same height? It was judged to affect no cells either way, and that is still true of
  the *cell* lists — but it was judged before the crossing was modelled. If one rail sits
  above the other, the two passes are at different heights, and the shared single clearance
  cell is worth re-checking. The spike's `crossCube` geometry is the place to look.
- **The starter set ships 0 crosses**, deluxe ships 2. Everything cross-related must run
  against deluxe or a synthetic inventory.
- **A crossing is a tie-breaker, not a prize.** It puts no extra cube on the table, so
  minimise-dropped only reaches for one when it is the only way to spend every cube — given
  4 straights, 6 flat curves and 1 cross the solver returns `RRRSXSLLLSXS`, eleven cubes in
  twelve steps, nothing dropped. If crossings should be interesting in their own right, that
  is an argument for a different objective — longest run, most faces, smallest footprint —
  not for changing the cross.
- **The crossing encoding is the expensive one:** pairing is O(steps²) booleans, off by
  default, and the 18-step optimisation with crossings on takes ~17 s against ~2 s without.
- **`cpsat-js` 1.0.0: `notEquals` is a silent no-op.** `addCrossings` uses the `differ`
  pattern for the heading-axis check because of it. `tests/library.test.js` guards this and
  will fail when the port is fixed.
- **Not yet checked:** whether two separate crosses can be crossed in the same loop (the
  model allows it; nothing has exercised it), and whether a cross can be entered from a face
  other than the one carrying its rails (it cannot — both rails are on one face, per
  `docs/pieces.md` — but nothing asserts that).
- **Test tiers:** `npm test` is the fast tier (~35 s), `SLOW=1 npm test` adds the exhaustive
  searches (~10 min). Serve the spike from the repo root, not from `spikes/track-piece`.

## State at handoff

All work is committed on `main` (`117568f` and the five before it). 98 tests, all passing in
both tiers. The full ladder from the previous session — model, oracle, and the CP-SAT model
through closure, collisions, clearance, inventory, objective and the cross — is done.

Known limit, unrelated to the cross but worth not rediscovering: the model does not scale to
the 66-piece deluxe set. At 66 steps it returns a poor incumbent rather than an optimum. The
fix named in `tests/clearance.test.js` is to replace the pairwise clearance encoding with a
boolean occupancy grid.
