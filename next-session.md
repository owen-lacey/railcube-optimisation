# Handoff: make the weighted-tracks data top and bottom 10 per slider setting

## Starting Prompt

Shrink `site/src/lib/data/sweep-crossed-weights.json` (1.43 MB raw / 77 KB gzipped) to only
the combinations the site can ever show: the **top 10 and bottom 10 for every slider
setting**, sliders 0–5 on all five metrics (knotted, orientations, close calls, repeats, longest
side), all 7,775 non-zero settings, **zeros included** — Owen does not want a minimum of 1.

How it works, as Owen asked for it and as was measured last session:

- Group the legal layouts of question 1 in `sweeps.db` by their five values (14,358
  combinations over 22,847,539 legal layouts).
- Each combination carries **one sample: its alphabetically first legal shape.**
- For each setting, rank combinations by `weigher` score (`site/src/lib/weighting.js`),
  **ties broken alphabetically by that sample shape**, and keep the top 10 and bottom 10.
- The union is **458 combinations, ~53 KB raw, ~8.6 KB gzipped** (top/bottom 1 alone: 55
  combinations, 1.4 KB gzipped).

Do this through `scripts/tally-weights.js` (it writes the file `WeightedTracks` reads), not
a new script, and change `weighting.js` and `WeightedTracks.svelte` to match. Before
writing code, read `scripts/tally-weights.js`, `site/src/lib/weighting.js`,
`site/src/lib/components/WeightedTracks.svelte`, `scripts/rank-tracks.js` and
`tests/weighting.test.js`, then put these open decisions to Owen — they are his to make,
not yours:

1. **The "N of 22.8M tie" count** under each end goes: it needs every tied row. Drop the
   line, or something else?
2. **What the component shows**: still one best and one worst end, or the 10 best and 10
   worst? (The 10 best are 10 distinct combinations, not 10 tied tracks.)
3. **Shuffle**: with one sample per combination there is nothing to cycle at an end. Drop
   shuffle, or keep a few samples per combination?
4. **`unsure` / unread-knot handling** in `weighting.js`: every knot is now read, so it can
   go — confirm (no-backward-compatibility rule says remove it).
5. **Overlap with the ranked figure**: another session built `scripts/rank-tracks.js` →
   `sweep-crossed-ranked.json` (`SWEEP_CROSSED_RANKED`, `RankedTracks.svelte`) for the
   equal-weights 10 best/worst. This file would be a superset of it. Keep both, or fold
   one into the other?

Constraints: `rank-tracks.js` reads `ranges` from this file's header, so keep `ranges` (or
update `rank-tracks.js` with it). Keep `tally-weights.js`'s audit — every kept sample
re-derived and its knot re-read on a fresh rotation before the file is written. Mirrors
score like their partner; the sizing counted them, so decide whether the alphabetical pick
should skip `mirrored = 1` rows as the tally's examples do. The working tree holds other
sessions' uncommitted changes — commit only your own, by path, and only when Owen asks.

## Relevant Files

- `scripts/tally-weights.js` — writes the file; currently one row per combination with
  `count` and `examples` only at ends. Imports `weightingValuesOf` from
  `scripts/sweep-data.js` (moved there by the other session).
- `site/src/lib/data/sweep-crossed-weights.json` — regenerated last session over 22.8M
  layouts (uncommitted), same shape as before.
- `site/src/lib/weighting.js` — `weigher` (integer scores via the LCM of ranges),
  `extremes` (tied ends, counts, `unsure`).
- `site/src/lib/components/WeightedTracks.svelte` — sliders, best/worst, count line,
  shuffle.
- `site/src/lib/sweeps.js` — exports `SWEEP_CROSSED_WEIGHTS`.
- `scripts/rank-tracks.js`, `site/src/lib/data/sweep-crossed-ranked.json`,
  `site/src/lib/components/RankedTracks.svelte`, `tests/ranked-tracks.test.js` — the
  other session's equal-weights top/bottom 10; depends on this file's `ranges`.
- `tests/weighting.test.js` — checks the ends over all 3,125 all-positive settings; will
  need rewriting for the new semantics.
- `/var/folders/pt/0mqlb8ld7k7_t48hvyl301rc0000gn/T/firsts.mjs` — the throwaway sizing
  script (one streaming pass, then ranking every setting). Its scan is cached in
  `firsts.json` beside it (14,358 combinations with their first shapes) — useful to check
  the implementation's output against, not to ship.
- `CLAUDE.md` — "The weighted best and worst" section describes the current file and will
  need updating.

## Key Context

- **Why zero weights matter**: with any slider at 0, ties are huge (knotted alone ties all
  3,032 knotted combinations at best, all 11,326 unknotted at worst), so "ever at an end"
  keeps every row. Alphabetical tie-breaking is what makes the cut work with zeros.
- **Reading `sweeps.db`**: a `GROUP BY … min(shape)` over 23M rows sorts on disk and was
  still scanning after 17 min — stream rows with `.iterate()` and reduce in JS instead.
  Even streaming took 27 min under heavy machine load (~3 min per 2M rows); the tally
  took a few minutes on a quiet machine.
- **Ranges unchanged by the new layouts**: knotted 0–1, orientations 6–20, close calls 0–27,
  repeats 0–9, longest side 7–17. Equal-weights best is still 2.360,
  `IRSSIIXLSLSOLLSSOSSIIRISSIXSORROSSSI`.
- **Database state**: last session's sweep added 7,595,410 layouts (23,305,965 total, 6.4
  GB). No backup since `sweeps.db.backup-2026-10-10` (taken before that sweep) — the new
  rows exist only in `sweeps.db`. All generators, the merge watch and the top-0.1% watcher
  are stopped.
