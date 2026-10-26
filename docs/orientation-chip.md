# Orientation chip

A chip in the post's prose that stands in for a hand-typed orientation, "(−z +y)", and shows a
picture of it on hover or tap. Agreed with Owen and built, 26 October 2026.

**Why.** A reader's feedback on `/post`: the "−x z etc axis descriptions are very dry… it did make
me stop which sort of broke me out of my reading flow." An inline glyph in place of the notation
was too small to be useful in prose; colouring the axes was set aside (the viewers draw the axes in
one colour, the pieces leave almost no hues free, and colour does not remove the decoding step).

## The component

- **`OrientationChip.svelte`** in `site/src/lib/components/`, used as
  `<OrientationChip orientation="DF" />`. The name and the prop are the prose term, not the code's
  "pose". The value is the usual two-letter code, floor then heading.
- **The chip** is a pill reading `poseLabel(orientation)` ("−z +y"), styled like `PoseChip`:
  `--card-border` border, 999px radius, weight 600. It sits inline in a sentence.
- **Behaviour is `PoseChip`'s**: a bits-ui `Tooltip` that opens on hover and keyboard focus; a tap
  toggles it; a tap elsewhere, a scroll or Escape closes it. Not portalled, `strategy="fixed"`,
  `collisionPadding={8}`, `side="top"`, for the same reason as `PoseChip` (a full-screen
  `ExpandingCard` is a modal dialog). It brings its own `Tooltip.Provider`, since prose has none.
- **The popover** holds the glyph, then the orientation in words with each axis inline:
  "down face (−z), heading forwards (+y)".
- **It is wrapped in an `inline-flex` span**, because bits-ui's tooltip markup leaves a
  whitespace text node beside the trigger while open, which in a sentence is a space before
  the punctuation; a flex box draws no whitespace-only text.

## The wording

`describePose` in `site/src/lib/catalogue.js` changes to the popover's form, "down face (−z),
heading forwards (+y)", so an orientation is put into words one way everywhere: `PoseChip`'s
tooltip, the `PoseCycle` and `OrientationStepper` captions, and the `PoseStep` and `PoseBuilder`
labels. `tests/moves.test.js` pins the wording and changes with it.

## The glyph

- **Pre-baked PNGs, one per orientation**, 24 in all, under
  `site/src/lib/assets/orientations/<CODE>.png`, imported through Vite so their URLs carry
  `BASE_PATH`. `alt=""`, since the words follow it. Shown at about 3× prose size.
- **Drawn by three.js from the viewers' default camera** (`CAMERA` in
  `site/src/lib/render/camera.js`, rot-x 65, rot-y −45):
  - one lattice cell in `--grid-color` (`cellEdges` in `render/grid.js`);
  - its floor face filled (`cellFace`);
  - a flat arrow lying on the floor along the heading. This is a new polygon generator; the
    mockup's dimensions were: inset to 0.46 × the floor axis, shaft −0.32 to 0.02 along the
    heading, head 0.4 wide with its tip at 0.36.
- **Captured** from the `Orientation snapshot` story (`OrientationSnapshotViewer`): an
  orientation control and a download button, 120 CSS px at pixel ratio 2. The first 24 were
  saved by driving that story's button over CDP, on Owen's say-so; a redone one is saved the
  same way, by hand or not. The drawing is `orientationGlyph` in `scenes.js`, `setOrientations`
  in `stage.js` and `floorArrow` in `render/grid.js`.

## Where chips go

Each replaces its brackets: "facing (−z +y)" becomes "facing [−z +y]".

| Where | Now | Chip |
|---|---|---|
| `site/src/routes/post/Coordinates.svelte`, the (f d) definition | — | `DF`, as an example |
| `Coordinates.svelte`, before `TrackSum a="SILISL"` | (-z +y) | `DF` |
| `Coordinates.svelte`, before `TrackSum a="XSR"` | (-z +x) | `DL` |
| `Coordinates.svelte`, before `TrackSum a="XSRRRSXSL"` | (+y -z) | `DF` — the text had face and heading swapped |
| `Coordinates.svelte`, the model's `<ol>`, step 3 | (-z +x) | `DL` |
| `Coordinates.svelte`, the model's `<ol>`, step 4 | (-z -x) | `DR` |
| `site/src/routes/post/TrackBuilding.svelte`, Completeness | (−z +y) | `DF` |

A chip takes a code, so the swapped "(+y -z)" is fixed by construction, and the prose's mix of
"-" and "−" goes with it (`poseLabel` emits "−").

## Accessibility and motion

The chip's accessible name is `describePose(orientation)`, and the visible label is
`aria-hidden`, as in `PoseChip`. The popover has no animation, so reduced motion needs nothing
extra.

## Testing

An `OrientationChip` Storybook story with an orientation control, like `PieceTag.stories.js`. No
unit tests.

