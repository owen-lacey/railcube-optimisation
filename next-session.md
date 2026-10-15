# Handoff: show the live score in the track builder through the Scorecard

## Starting Prompt

Build the running weighted score into the track builder (`site/src/lib/components/TrackBuilder.svelte`) using the Scorecard (`site/src/lib/components/Scorecard.svelte`), so the five readings and the total update as a track is clicked together.

Where things stand (commit `c137f66`):
- **The score already exists.** `weightedScoreOf(placed, closed)` in `site/src/lib/score.js` returns `{ readings: { knotted, poses, closeCalls, repeats, longestSide }, score }`, or null for no pieces.
  - It uses equal weights over the crossed sweep's ranges (`SWEEP_CROSSED_WEIGHTS.ranges`).
  - It is live: on an open track, repeats and close calls count only real neighbours, through the `{ open }` option of `repeatsOf`/`closeCallsOf` in `src/metrics.js`.
  - Knotted is 0 until the loop closes. It is then read in the browser by `readKnot` in `site/src/lib/knots.js`, which is the JS port of the topoly knot reader.
- **`TrackBuilder` already wires it, roughly.** A `scored` derived value, computed on `view.pieces` minus the offender, feeds a bare `score.toFixed(2)` total in the footer. That total was a stand-in until there was UI.
- **The Scorecard cannot take that yet.** It takes a `shape` and reads it through `readingsOf(shape)` in `site/src/lib/readings.js` (uncommitted, Owen's). That function calls `chainTrack`, so it only works on closed tracks, and it looks the knot up in stored data, so it only works on swept shapes. Neither holds for a track being built.
- **How the Scorecard is shown elsewhere.** `ScoredTrack.svelte` lays it over the viewer's top-left corner through `Frame`'s `overlay` snippet. `TrackBuilder` uses `ExpandingCard` + `TrackViewer` directly, not `Frame`.

Ground rules: this is a learning exercise for Owen, so do not prescribe the design. Ask him, before building, about:
1. **How the Scorecard gets its numbers in the builder.** It could take readings as a prop, `weightedScoreOf` and `readingsOf` could merge, or something else. `readings.js` and `score.js` currently assemble the same five readings two ways.
2. **Whether the Scorecard shows the total** (or the per-metric working, as `ScoreMaths` does with `termsOf` in `weighting.js`), and **whether the footer total stays**.
3. **How an open track's readings should look.** An unclosed track has no knot. And a short track scores outside the sweep's ranges (above 1 on longest side, below 0 on orientations), which is currently unclamped.
4. **Where it sits over the builder's viewer**, given that `TrackBuilder` has no `overlay` slot and expands to full screen.

First: read `TrackBuilder.svelte`, `Scorecard.svelte`, `ScoredTrack.svelte`, `Frame.svelte`, `ExpandingCard.svelte`, `score.js` and `readings.js`. Then ask Owen the questions above.

Testing rules (CLAUDE.md):
- Run only the test files covering the change, e.g. `node --test tests/score.test.js tests/weighting.test.js`.
- Never run the full `npm test` unless Owen asks, and never alongside a heavy job.
- Check UI by driving Storybook over CDP (see CLAUDE.md).

## Relevant Files

- `site/src/lib/components/TrackBuilder.svelte`: the builder. It holds `letters`, derives `view` from `openScene`, and has the `scored` derived value and footer total from last session.
- `site/src/lib/components/Scorecard.svelte`: the five readings as a `<dl>`, styled as a see-through overlay. It takes `shape` only.
- `site/src/lib/components/ScoredTrack.svelte`: the pattern for overlaying the Scorecard on a viewer (`Frame` `overlay` snippet).
- `site/src/lib/score.js`: `weightedScoreOf(placed, closed)`, the live, open-aware readings and score.
- `site/src/lib/readings.js`: `readingsOf(shape)`, uncommitted and Owen's. Closed shapes only, with stored knots. Shared by Scorecard, ScoreMaths and the tests.
- `site/src/lib/knots.js`: the JS knot reader (`readKnot`, `certified`, `alexander`).
- `site/src/lib/weighting.js`: `weigher`, `DIRECTIONS`, and the uncommitted `termsOf` (the per-metric working).
- `site/src/lib/components/ScoreMaths.svelte`: uncommitted, Owen's. Shows the score's working term by term.
- `site/src/lib/components/ExpandingCard.svelte`, `Frame.svelte`, `LayoutCard.svelte`: card, footer and overlay plumbing.
- `src/metrics.js`: `repeatsOf` / `closeCallsOf` with `{ open }`.
- `tests/score.test.js`, `tests/metrics.test.js`, `tests/knot-reader.test.js`: last session's tests.

## Key Context

- **Owen's calls from last session:**
  - The score is the five-metric weighting at equal weights.
  - Repeats and close calls must be known as the track is built, not only once closed.
  - The knot reader was ported to JS.
- **The JS knot reader was checked against `sweeps.db`.** Over 81,020 rows (10,000 uniform, plus all 71,045 knotted), it agreed with the stored knot on every reading except row 14772602, which the certificate proves is stored wrong.
  - The certificate clears 99.4% of unknot readings, matching the Python one.
  - Timing: ~1.7 ms a certified reading, ~30 ms median (65 ms at the 99th percentile) for one that needs the Alexander polynomial.
  - The builder reads the knot only on the piece that closes the loop.
- **Stuck tracks.** When a piece is rejected, `openScene`'s `view.pieces` ends with that piece, so scoring must drop it (`TrackBuilder` already does).
- **Uncommitted work in the tree is Owen's.** That includes `readings.js`, `ScoreMaths`, `ScoredRanking`, `termsOf`, and changes in `CLAUDE.md`, `Scorecard.svelte` and `tests/weighting.test.js`. Commit only this session's changes, by explicit path, with no AI trailer.
- **Open follow-ups, not for this task:** whether the sweep tooling moves from topoly to the JS reader, retiring `scripts/knots.py`.
