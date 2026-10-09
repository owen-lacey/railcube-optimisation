# Accessibility

Open issues, and what has been decided about them. Ratios are WCAG 2.2 contrast
ratios, worked out from the hex values in the code (measured 6 October 2026).

## Open: the piece colours fail contrast

The piece colours (`COLORS` in `site/src/lib/render/dimensions.js`) are the physical
set's (docs/pieces.md), and they are too light against the page. They are not used in
just one place: they colour every piece in every viewer, the title's letters, the
`PieceTag` badges and any `Highlight` given a piece token. Fixing them changes how
everything in the post looks.

| Colour | Hex | on white (`--page`) | on `--card-footer` |
|---|---|---|---|
| straight | `#ffd166` | 1.44 | 1.22 |
| cross | `#b48ce8` | 2.67 | 2.26 |
| outsideCurve | `#ef6461` | 3.15 | 2.66 |
| leftCurve | `#6bbf59` | 2.28 | 1.92 |
| rightCurve | `#5b8def` | 3.23 | 2.73 |
| insideCurve | `#f2933a` | 2.33 | 1.97 |

The 3D pieces are shaded (`LIGHT` in the renderer), so their faces come out darker
than these base colours. The table is a best case for the pieces, and exact for the
flat uses.

Where each use stands against the threshold that applies to it:

- **`PieceTag`** (white text on the piece colour; normal text needs 4.5:1). Every
  piece fails, and `S` is 1.44:1, which is close to unreadable.
- **`Highlight` with a piece token** (piece-coloured bold text on white; needs 4.5:1).
  Every piece token fails. Only `grid-color` (4.60) passes, and that is the only token
  the post uses so far.
- **The `Splash` title** (pictures of text, so it is held to text contrast, 3:1 even if
  you count it as large). Straights at 1.44 make up much of every letter, and only
  red and blue reach 3:1.
- **Pieces in the viewers** (graphical objects needed to understand the content; WCAG
  1.4.11 needs 3:1 against the colours next to them). Yellow, green, orange and purple
  fail against white, and fail by more against the card footer.

Other colours, for the same audit:

| Colour | Hex | on white | Where it fails |
|---|---|---|---|
| `--grid-color` | `#4f75b8` | 4.60 | passes as text and as lines |
| `--muted` | `#6b7382` | 4.77 | passes on white, 4.03 on `--card-footer` (fails as text there) |
| `--ghost-after` | `#6b7a90` | 4.36 | fails as normal text, passes as graphics |
| `--ghost-before` | `#b4bfcd` | 1.86 | fails as graphics |
| `--card-border`, `--rule` | `#aab2bf` | 2.14 | a decorative border is exempt; an outline someone needs in order to see a boundary is not |
| `TRAIN_COLOR` | `#f8fafc` | 1.05 | the train is almost white on white wherever it is not over track |

Decisions needed before anything changes (Owen's call):

1. Keep the physical set's colours and fix each place they are used (darker text
   colours, outlines on pieces, a darker page or card background). Or move the palette
   itself away from the real set.
2. Whether the title stays pictures of text, or is also shown as visible text.
3. Which of the graphics-only colours (ghosts, borders, the train) are needed to
   understand the content, and so are held to 3:1.

Once it is decided, the ratios belong under test (a check over the colour tokens, like
`tests/colours.test.js`) rather than in this file, so a new colour cannot go back to
failing without anyone noticing.
