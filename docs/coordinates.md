# Coordinate system

How we describe where the track is and which way it's going. Companion to
[pieces.md](pieces.md), which describes the pieces themselves.

## The viewer frame

Same convention as pieces.md: all directions are from a fixed viewer standing in front of
the layout — **up/down, left/right, forwards/backwards**, with forwards = away from the
viewer. The frame never rotates with the train: "left" always means the viewer's left,
even when the train is on a wall or upside down.

The viewers draw it that way round: forwards runs away from the reader, up and to the
right on screen, so a track sets off from the bottom left (`CAMERA` in
`site/src/lib/render/camera.js`).

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

The origin (0, 0, 0) is the cell the start cube occupies. The train starts in the cell
on top of it, (0, 1, 0).

## The reader's axes

The post writes positions as (x, y, z) with **x left, y forwards, z up**. Viewed
from the default camera (forwards up and away to the right), x then grows away from
the reader too, which is why it was chosen. The cost: with z up this is a
*left-handed* frame, so it is not the maths/CAD convention. The model's own frame
above (x right, y up, z forwards) is unchanged; what the reader sees negates x and
swaps the last two. The viewer's `origin` option outlines the origin cell and stands
three arrows just outside the lattice's outer corner, clear of the track
(`render/axes.js`), with x, y and z as text beside their tips; the train-cell caption
is written in this frame, so a cell one to the right of the start reads x = -1.

## Faces

A cell's six faces are named by the direction each one points, using the same six
letters. The **up face** points up (the "top" in pieces.md), the **down face** points
down (the "bottom"), and the **front face** points forwards — meaning it's the *far*
side of the cell from the viewer, the way a car's front points the way it's travelling.

## Pose: floor + heading

The train is always in a cell, facing some way *within* it. Position alone doesn't say
which way — a train in a given cell can be riding along its floor or clinging to one of
its walls, and those have different legal next pieces. So the state of the track's open
end is a position plus a **pose**.

Both are read **once the train has finished travelling a piece**, never part-way along
one. The position is the **cell the train is in** at that moment: the cell over the cube
the next piece will click into. The pose, written as two letters, says how the train
stands in that cell:

1. **Floor** — which face of its cell the train is standing on. The next piece's cube
   is on the other side of that face, and its rail is on the cube's opposite face.
2. **Heading** — the absolute direction the train is travelling

Examples:

| Pose | Meaning |
|---|---|
| `DF` | standing on the down face, heading forwards — the ordinary case, riding on top of a cube |
| `BD` | standing on the back face, heading down — driving down the far side of a wall |
| `UR` | standing on the up face, heading right — hanging upside down, moving right |
| `LU` | standing on the left face, heading up — climbing a wall to its left |

Reading positions and poses only between pieces is what keeps this simple. Part-way
along a piece the train can pass through cells a pose would not describe — the inside
curve's train runs through the hollow of its own arc — but nothing is ever stated about
those moments.

### Validity rule

The train travels along its floor, so **the heading can never be the floor letter or
its opposite**. That rules out the pairs on the same axis:

- Same letter: `FF` `BB` `UU` `DD` `LL` `RR`
- Opposites: `FB` `BF` `UD` `DU` `LR` `RL`

Every floor admits exactly the four headings perpendicular to it:

| Floor | Valid headings |
|---|---|
| U, D | F, B, L, R |
| F, B | U, D, L, R |
| L, R | U, D, F, B |

That's 24 valid poses out of 36 letter pairs. Sanity check: 24 is exactly the number of
ways a cube can be rotated, so the encoding is complete (every physical pose has a code)
and non-redundant (no two codes mean the same pose).

## Absolute and relative

The model uses both views of the same movement:

- **Relative** — what one piece does: a displacement (how the train's cell changes) and
  a new pose. A piece's effect depends on the pose it's entered with: the same outside
  curve carries a `DF` train over an edge into `BD`, but an `LU` train around a
  different edge entirely.
- **Absolute** — where the track currently is: the train's starting cell plus the
  running total of every displacement so far, and the current pose.

The closed-loop constraint falls out of this directly. The start cube is at (0, 0, 0)
and the train starts on top of it, at (0, 1, 0) facing `DF`; the start cube is the
first piece clicked in under it. The track is a closed loop when, after the last piece,
the train is back at (0, 1, 0) facing `DF` — every displacement summing to zero.
Getting back to the start cell with the wrong floor or heading doesn't close the loop —
the last piece has to click into the first one exactly.

## What each piece does

The catalogue of relative moves. Each piece is shown in one concrete orientation —
entered by a train facing `DF` (standing on the down face of its cell, heading
forwards), so the piece's cube is the one below the train. Entered in any other pose,
the piece is simply rotated, and its displacement and exit pose rotate with it.

Displacements are measured from the cell the train is in when it gets onto the piece
to the cell it is in once it has finished travelling it. "Cells occupied" is the
piece's bounding box — what must be empty to place it — measured from the same
starting cell. The cells the *train* needs are a second, separate list, tabled under
[what the train needs](#what-the-train-needs) below.

| Piece | Train moves | (x, y, z) | Exit pose | Cells occupied |
|---|---|---|---|---|
| Straight | 1 forwards | (0, 0, 1) | `DF` | the cube below the train |
| Cross | 1 forwards | (0, 0, 1) | `DF` | the cube below the train |
| Left curve | 1 forwards, 2 left | (−2, 0, 1) | `DL` | 2×2 below the train: 1 down, 1 down+forwards, 1 down+left, 1 down+forwards+left |
| Right curve | 1 forwards, 2 right | (2, 0, 1) | `DR` | 2×2, mirror of the left curve |
| Inside curve | 1 up | (0, 1, 0) | `FU` | 2×2: 1 down, 1 down+forwards, the train's own cell, 1 forwards |
| Outside curve | 1 forwards, 2 down | (0, −2, 1) | `BD` | the cube below the train |

The inside curve is the one piece whose footprint includes the cell the train starts
in: the train gets on inside the hollow of the arc it is about to climb.

Two sanity checks:

- **Four left curves make a ring.** Chaining the left-curve move four times, each
  rotated 90° from the last, sums to zero displacement — a closed loop — and the four
  2×2 footprints tile a 4×4 square exactly. That is the free-standing donut in the
  product photos.
- **Rotation covers "up and over".** An outside curve entered at `FU` (climbing the
  near side of a wall) is the same table row rotated: the train moves 2 forwards and
  1 up, and the exit pose is `DF` — it crests the wall onto its top. No extra rows are
  needed; every entry pose is a rotation of the row above.

The vertical pair is asymmetric on purpose. The inside curve turns the train through
the *inside* of a corner, so it needs a wide arc for the train to fit — hence the 2×2
footprint. The outside curve wraps the train around the *outside* of a single cube's
edge, so it can be as tight as the cube itself — no forwards progress for the cubes at
all; the next cube clicks in directly underneath, and the train comes round the edge
to face down its far side.

## What the train needs

The train rides on the outside of the track, so it needs cells of its own on top of the
ones the pieces occupy. **The rule: wherever the train is, it counts as filling the whole
cell it is in** — the cell on the far side of its floor from the cube, never the cube's
own cell. It really only pokes a bit under half a cell past the surface, but a cell is
the unit the model reasons in, and rounding up costs nothing: a cube in that cell would
have its own surface right there to be hit.

So each piece claims two lists — the cells its **material** fills, and the cells its
**train** needs — and the no-collision rule becomes: no cell is ever both.

Same convention as the table above: piece entered at `DF`, offsets from the train's
starting cell, everything else is this rotated.

| Piece | Cells the train needs | Count |
|---|---|---|
| Straight | its own cell | 1 |
| Cross | its own cell | 1 |
| Left curve | the whole 2×2 layer it is in: its cell, 1 forwards, 1 left, 1 forwards+left | 4 |
| Right curve | the 2×2 layer it is in, mirror of the left curve | 4 |
| Inside curve | none beyond the piece's own footprint | 0 |
| Outside curve | its own cell, 1 forwards, 1 forwards+down | 3 |

Four of the six read straight off "the cells the train is in". The other two are the
interesting ones:

- **The inside curve needs nothing extra.** Its rail is on the *concave* face, so the
  cell the rail faces into is a cell the arc's own 2×2 footprint already claims — the
  train runs through the hollow of the arc. Nothing else could be in there anyway.
- **The outside curve needs three cells for a one-cube piece.** The train wraps the
  *outside* of the edge, so it sweeps the rest of the 2×2 around that edge: above the
  cube, in front of it, and diagonally across the corner between them.
- **The flat curves need all four cells, not three.** The train is wider than the rail,
  so on the arc its inner flank passes over the cell at the *inside* of the bend even
  though the rail's centre line never enters it.
- **The cross needs one cell, not two.** Both rails cross on the same face, so both
  traversals want the same cell above it — and there is only ever one train, so the two
  visits happen at different times and cost nothing extra.

### Two things that follow

**Trains never conflict with each other, only with material.** There is one train, so two
pieces are free to want the same train cell (which is what makes a cross legal at all).
Only material-vs-material and material-vs-train are collisions.

**Joins need no special handling.** The train is 14 units long against a 20-unit cube, so
crossing a join it overhangs the piece behind by up to 7 units. Sampling each piece's rail
from its own entry mouth up to (not including) the next one, every such overhang lands in
a cell that the neighbouring piece already claims itself — so the per-piece lists above
stitch into a complete swept volume with no gaps and no extra bookkeeping.

*(Derivation: sample `railFrame` along each piece and take the cell one cube along `up`.
One rounding-scale caveat, noted for honesty and ignored: a rigid 14-long body tilts
nose-up entering an inside curve, dipping its rear corner ~0.1 units below the previous
cube's surface. The real loco is presumably a little shorter or articulated.)*

### What clearance costs

Both lists are now executable — `src/track.js` carries them as `train:` alongside `foot:`,
and `assertNoCollisions` enforces the full rule. Re-running the exhaustive search with and
without clearance (`src/enumerate.js`, starter set, no cross, nothing below the ground,
within a 6-cell box) shows where it bites:

| Loop | Material only | With clearance |
|---|---|---|
| Shortest closed loop | 4 pieces — `LLLL`, `RRRR`, `IIII` | 4 pieces, the same three |
| Shortest loop reaching all six faces | **12** pieces, 4 of them | **14** pieces, 72 of them |

At four pieces clearance changes nothing: the rings are small enough that the train has the
room it needs. At twelve it changes everything — all four of the material-only six-face
loops are illegal once the train needs room, and so is everything at thirteen. So the
earlier "twelve" was an upper bound, and the honest figure is **fourteen**.

Two things follow. The 14-piece loop the site draws is not one over the minimum, it *is*
the minimum. And the four 12-piece loops are not four shapes but one: all four are the same
cyclic sequence read from a different starting piece, and swapping every left curve for a
right one maps that sequence onto one of its own rotations, so it is its own mirror.

Take the ground away and a fourth four-piece ring appears: four outside curves cresting the
edges of a 2×2 block, the train running round its outside. It is legal under both collision
rules and is excluded only by `minY ≥ 0` — worth knowing, because "there are three rings" is
a fact about the floor rather than about the pieces.

### What the solver says

Handed all 32 starter pieces, a 6-cell box, the ground, and "minimise dropped pieces",
CP-SAT proves an optimum of **0 dropped**: every cube in the box goes into one closed loop,
in about 85 seconds.

| Run | Box | Used | Dropped | Extent | Result | Scene |
|---|---|---|---|---|---|---|
| Owen's set (36) | 6 | **36** | 0 | 11×7×8 | optimal, 1190 s | `solved:owen` |
| Starter set | 6 | **32** | 0 | 7×7×8 | optimal, 200 s | `solved:32` |
| Starter set | 4 | 20 | 12 | 4×5×8 | best found in 400 s, not proved | `solved:tight` |
| Starter set | 3 | 18 | 14 | 7×4×7 | best found in 400 s, not proved | `solved:cramped` |
| Deluxe set | 7 | — | — | — | **no useful answer in 600 s** | — |

Each is on the site's layouts page, alongside the figure of eight — a
twelve-step figure of eight over eleven cubes, which crosses itself once. `npm run
build-sheet -- <name>` prints any of them as a numbered click-together order.

The first row is the one that matters in practice: Owen's own set is the starter set plus
four extra inside curves, and all 36 of its cubes go into one loop with nothing left over.
Nothing dropped also settles the box question for free — no larger box can beat spending
every piece, so 6 was never the binding constraint there.

Three things fall out of the table. Shrinking the box from 6 to 4 costs a third of the set,
so what binds is space rather than pieces. The 3-cell box fills itself exactly (7×4×7 in a
box that allows 7×7×7) and settles on two vertical rings threaded through each other. And
**the model does not currently scale to the deluxe set**: at 66 steps it returns a poor
incumbent rather than an optimum, which is the point at which the pairwise clearance
encoding should be replaced by a boolean occupancy grid. `tests/clearance.test.js` carries
the benchmark that says so.

Three smaller results from the same model:

- **The box has a floor of 3.** Below that the model really is infeasible, which is the one
  exception to "it can always drop everything but a four-piece ring". The start cube is
  nailed to the origin facing forwards and the smallest ring spans four cells, so it must
  reach three cells to one side; a box of 2 cannot hold one. At 3 and above it sheds pieces
  rather than failing.
- **The collision rule is free below eight pieces.** Nothing shorter than eight passes
  through itself, so every four- and six-piece result is the same with the rule and without
  it. Worth knowing before reading much into a small example.

Two more from the shape of the search itself, both surprises worth keeping:

- **No closed loop has an odd number of pieces.** Both searches agree, at every length tried.
- **A crossing is a tie-breaker, not a prize.** Crossing puts no extra cube on the table, so
  maximising cubes has no direct reason to want one: given a set that closes comfortably
  without crossing, the optimum places its crosses and drives straight over them. But when
  crossing is the only way to close a loop that spends *every* cube, the solver finds it
  unprompted — `RRRSXSLLLSXS` uses eleven cubes in twelve steps and drops nothing.
