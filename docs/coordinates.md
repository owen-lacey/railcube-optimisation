# Coordinate system

How we describe where the track is and which way it's going. Companion to
[pieces.md](pieces.md), which describes the pieces themselves.

## The viewer frame

Same convention as pieces.md: all directions are from a fixed viewer standing in front of
the layout — **up/down, left/right, forwards/backwards**, with forwards = away from the
viewer. The frame never rotates with the train: "left" always means the viewer's left,
even when the train is on a wall or upside down.

Single-letter abbreviations: **U, D, L, R, F, B**. Each direction has an opposite:
U↔D, L↔R, F↔B.

## Position

Where a cube sits in the layout: three whole numbers counting cubes along each axis.

| Axis | Negative | Positive |
|---|---|---|
| x | left | right |
| y | down | up |
| z | backwards | forwards |

Moving one cube in a direction changes exactly one coordinate by ±1: one cube to the
right is x+1, one cube up is y+1, one cube forwards is z+1, and so on.

(Internal notation only — the blog post says "two cubes to the right and one up" rather
than (2, 1, 0).)

The origin (0, 0, 0) is the cell the start cube occupies.

## Faces

A cube's six faces are named by the direction each one points, using the same six
letters. The **up face** points up (the "top" in pieces.md), the **down face** points
down (the "bottom"), and the **front face** points forwards — meaning it's the *far*
side of the cube from the viewer, the way a car's front points the way it's travelling.

## Pose: face + heading

Position alone doesn't say how the track continues — a track arriving at the same cube
can be riding on top of it or clinging to its side, and those have different legal next
pieces. So the state of the track's open end is a position plus a **pose**.

The position is the **next empty cell** — the cell the next piece will click into, not
the cube the last-placed piece occupies. The pose, written as two letters, says how the
rail enters that cell:

1. **Face** — which face of the cube the rail is on
2. **Heading** — the absolute direction the train is travelling

Examples:

| Pose | Meaning |
|---|---|
| `UF` | on top of the cube, heading forwards — the ordinary case |
| `FD` | on the front face, heading down — driving down the far wall |
| `DR` | on the down face, heading right — hanging upside down, moving right |
| `RU` | on the right face, heading up — climbing the right-hand wall |

### Validity rule

The rail's direction of travel always lies flat along the face it's mounted on, so
**the heading can never be the face letter or its opposite**. That rules out the pairs
on the same axis:

- Same letter: `FF` `BB` `UU` `DD` `LL` `RR`
- Opposites: `FB` `BF` `UD` `DU` `LR` `RL`

Every face admits exactly the four headings perpendicular to it:

| Face | Valid headings |
|---|---|
| U, D | F, B, L, R |
| F, B | U, D, L, R |
| L, R | U, D, F, B |

That's 24 valid poses out of 36 letter pairs. Sanity check: 24 is exactly the number of
ways a cube can be rotated, so the encoding is complete (every physical pose has a code)
and non-redundant (no two codes mean the same pose).

## Absolute and relative

The model uses both views of the same movement:

- **Relative** — what one piece does: a displacement (how the position changes) and a
  new pose. A piece's effect depends on the pose it's entered with: the same outside
  curve carries an `UF` train over an edge into `FD`, but an `RU` train around a
  different edge entirely.
- **Absolute** — where the track currently is: the running total of every displacement
  so far, plus the current pose.

The closed-loop constraint falls out of this directly. The head starts at (0, 0, 0)
with the starting pose, and the start cube is the first piece clicked into it. The
track is a closed loop when, after the last piece, the head is back at (0, 0, 0) with
that same pose — every displacement summing to zero. Getting back to the start cell
with the wrong face or heading doesn't close the loop — the last piece has to click
into the first one exactly.

## What each piece does

The catalogue of relative moves. Each piece is shown in one concrete orientation —
clicked into a head whose pose is `UF` (rail on top, heading forwards). Entered in any
other pose, the piece is simply rotated, and its displacement and exit pose rotate
with it.

Displacements point at the **next empty cell** (the head convention above), not at the
last cell the piece occupies. "Cells occupied" is the piece's bounding box — what must
be empty to place it. The cells the *train* sweeps through are a separate, still-open
question ([pieces.md](pieces.md), open questions).

| Piece | Next empty cell | (x, y, z) | Exit pose | Cells occupied |
|---|---|---|---|---|
| Straight | 1 forwards | (0, 0, 1) | `UF` | its own cell |
| Cross | 1 forwards | (0, 0, 1) | `UF` | its own cell |
| Left curve | 1 forwards, 2 left | (−2, 0, 1) | `UL` | 2×2: own cell, 1 forwards, 1 left, 1 forwards+left |
| Right curve | 1 forwards, 2 right | (2, 0, 1) | `UR` | 2×2, mirror of the left curve |
| Inside curve | 1 forwards, 2 up | (0, 2, 1) | `BU` | 2×2: own cell, 1 forwards, 1 up, 1 forwards+up |
| Outside curve | 1 down | (0, −1, 0) | `FD` | its own cell |

Two sanity checks:

- **Four left curves make a ring.** Chaining the left-curve move four times, each
  rotated 90° from the last, sums to zero displacement — a closed loop — and the four
  2×2 footprints tile a 4×4 square exactly. That is the free-standing donut in the
  product photos.
- **Rotation covers "up and over".** An outside curve entered at `BU` (climbing a wall)
  is the same table row rotated: the displacement becomes 1 forwards and the exit pose
  `UF` — the train crests the wall onto its top. No extra rows are needed; every entry
  pose is a rotation of the row above.

The vertical pair is asymmetric on purpose. The inside curve turns the train through
the *inside* of a corner, so it needs a wide arc for the train to fit — hence the 2×2
footprint. The outside curve wraps the train around the *outside* of a single cube's
edge, so it can be as tight as the cube itself — no forwards progress at all; the next
cube clicks in directly underneath.
