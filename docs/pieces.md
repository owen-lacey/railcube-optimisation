# Rail Cube piece reference

A contract-style reference for every piece in the Rail Cube system: what it is, how the
train moves through it, and what we still need to verify against the physical set.

Legend: ✅ confirmed by published sources or the physical set · ⚠️ inferred from piece
names/product photos — **verify against the physical set**.

## How the system works

- ✅ Cubes click together face-to-face ("connect with a click, disconnect with a twist")
  to form a rigid 3D structure.
- ✅ Each track cube carries a moulded rail on its **outside surface**. The train straddles
  the rail and is held on by magnets, so it can run up walls, across ceilings, and upside
  down — the structure's shape is what steers the train.
- ✅ There are five track piece types (straight, inside curve, outside curve, left/right
  curve, cross) plus a start cube and three kinds of rail-less support pieces.
- ✅ Materials: ABS and POM plastic; supports use stainless steel rods.
- ⚠️ Cube edge length: not published anywhere — measure one.

## Conventions in this document

All directions are from a fixed viewer standing in front of the layout: **up/down,
left/right, forwards/backwards** (forwards = away from the viewer). A cube's six faces are
named **top, bottom, left, right, front, back**. Each example places the piece in one
concrete orientation; pieces can of course be rotated into others.

## Track pieces

Each piece's displacement and exit pose — the numbers the model will use — are
catalogued in [coordinates.md](coordinates.md#what-each-piece-does).

### Straight — yellow

| | |
|---|---|
| Count | 15 (starter) / 31 (deluxe) ✅ |
| Faces with rail | one ⚠️ |
| Effect on train | none — passes straight through ⚠️ |

The rail runs in a straight line across one face, from one edge to the opposite edge.
Example: cube on the table, rail on the top face running left–right; the train enters
above the left edge and leaves above the right edge, still travelling the same way.

### Start cube — white

| | |
|---|---|
| Count | 1 (starter) / 1 (deluxe) ✅ |
| Geometry | same as a yellow straight ⚠️ |

Sold as "Straight Block with white start Cube" ✅, so geometrically a straight. Marketing
frames it as where the journey begins — the reference point when "reading" a track as a
sequence of coloured blocks (the coding/程 pedagogy angle in the Program Notebook).
⚠️ Verify it has no functional extra (charging point, switch, sensor) beyond the colour.

### Left / right curve — green and blue

| | |
|---|---|
| Count | 8 (starter) / 16 (deluxe), green+blue combined ✅ |
| Shape | quarter-arc block spanning a 2×2 footprint ✅ |
| Effect on train | 90° turn within the plane it's riding in ✅ |

Not a cube: a quarter of a donut, sweeping through a 2×2 block of cells. The rail runs
along the arc's flat face; the train enters one end travelling forwards and leaves the
other travelling left (or right), ending up one cell forwards and one across, with the
next cube clicking in one further across. Four of them click into a free-standing ring,
as in the product photos.

⚠️ Open question: whether green and blue are geometric mirror images or identical pieces
in two colours. A flat elbow can be rotated on its face to serve as either a left or a
right turn, so two distinct shapes are only necessary if the click-connectors key the
cube's orientation. Check whether a green curve can be placed to turn both ways.

### Inside curve — orange

| | |
|---|---|
| Count | 4 (starter) / 8 (deluxe) ✅ |
| Shape | quarter-arc spanning a 2×2 footprint in a vertical plane, rail on the **concave** face ✅ |
| Effect on train | 90° turn *out of* the surface, valley-style (concave) ✅ |

The same quarter-arc shape as the left/right curve, but stood in a vertical plane with
the rail on the concave inner face. The train turns through the inside of a corner, like
the bottom of a skate ramp. Example: the train runs forwards along the ground towards a
wall of cubes; the inside curve sits at the base of the wall and carries the rail from
running flat into running straight up the wall's back face. The train's belly faces the
corner throughout.

A full vertical loop is four inside curves — at the top of the loop the train hangs
upside down on the inside of the ring.

### Outside curve — red

| | |
|---|---|
| Count | 4 (starter) / 8 (deluxe) ✅ |
| Shape | single cube, rail wrapping convexly around one edge ⚠️ (product photos) |
| Effect on train | 90° turn *out of* the surface, crest-style (convex) ✅ |

The train wraps around the outside of an edge, like driving over the brow of a hill. The
rail crosses one face, bends around the cube's edge, and continues on the adjacent
perpendicular face. Example: the train runs forwards along the top of a wall, reaches the
end, and curls over the edge to continue straight down the wall's far side.

Unlike the inside curve it makes no forwards progress — the next cube clicks in directly
underneath. The asymmetry is physical: the train rides the *outside* of this corner, so
the bend can hug a single cube, while the inside curve needs a wide arc for the train to
fit through the *inside*.

Climbing up and over a wall therefore uses both kinds: an inside curve at the bottom
(ground → wall), an outside curve at the top (wall → roof), and mirror-images of those on
the way down.

### Cross — purple

| | |
|---|---|
| Count | 0 (starter) / 2 (deluxe) ✅ |
| Faces with rail | one, carrying two rails ⚠️ |
| Effect on train | none — passes straight through ⚠️ |

Two straight rails crossing at right angles on the same face ("criss-cross paths" ✅).
It is a crossing, not a junction: the train cannot choose a branch, it continues straight
along whichever rail it entered on. Enables figure-of-eight layouts where the track passes
through the same cube twice without the pieces colliding.

## Support pieces (no rail)

Published copy says almost nothing about these — all details ⚠️ except counts.

| Piece | Starter | Deluxe | Role |
|---|---|---|---|
| Support stand | 16 | 32 | vertical column holding elevated track off the ground |
| T-support | 4 | 8 | bracing / joining supports to track (exact use unclear) |
| Support joint | 8* | 8 | connecting supports to each other or to cubes |

*Sources disagree: 4 or 8 support joints in the starter set. Count yours.

To verify: how a stand attaches to a cube (which face, does it block a rail?), what height
one stand adds, whether stands can stack, and what the T-support and joint actually do.

## Inventory summary (track cubes)

| Piece | Colour | Starter | Deluxe |
|---|---|---|---|
| Straight | yellow | 15 | 31 |
| Start (straight) | white | 1 | 1 |
| Left/right curve | green/blue | 8 | 16 |
| Inside curve | orange | 4 | 8 |
| Outside curve | red | 4 | 8 |
| Cross | purple | 0 | 2 |
| **Total** | | **32** | **66** |

Starter totals match the published "32 block pieces" exactly ✅. Deluxe marketing is
inconsistent — "66-piece" in some listings, "64 pieces + 2 trains" in others — but the
itemised list above sums to 66 track cubes and is consistent across two retailers.

## Open questions to settle with the physical set

1. Measure the cube edge length.
2. Outside curve: confirm it is a single cube with the rail wrapping one edge, and that
   the next cube clicks in directly underneath — inferred from product photos; the other
   curves are verified against the physical set.
3. Green vs blue: mirror shapes, or same shape in two colours? Are connectors keyed
   (limited orientations per face) or can any face attach at any rotation?
4. Can a cube attach onto a face that carries rail, or are rail faces connection-free?
5. Can the train traverse every piece in both directions?
6. Does the start cube do anything beyond being white?
7. Do the two rails on a cross block sit at the same height (true flat crossing)?
8. Support system: attachment points, height per stand, stacking, T-support/joint roles.

Settled since: **clearance** — which cells the train needs on each piece, as distinct from
the piece's own footprint — is tabled in
[coordinates.md](coordinates.md#what-the-train-needs).

## Sources

- [Rail Cube official site](https://www.railcubetoys.com/) — five cube types, click/twist connection
- [Deluxe set](https://www.railcubetoys.com/product-page/magnetic-monorail-deluxe-set) and [starter set](https://www.railcubetoys.com/product-page/magnetic-monorail-starter-set) — itemised contents
- [Official shop](https://www.railcubetoys.com/shop) — individual piece products and colours
- [MoMA Design Store listing](https://store.moma.org/products/magnetic-train-rail-cube-block-toy-set-deluxe-66-pcs) — up/down/upside-down behaviour
- [Gingerbread House Toys](https://gingerbreadhousetoys.com/products/rail-cube-magnetic-monorail) — manufacturer (Meekins Corp), colour-sequencing pedagogy
- [Serious Insights review](https://www.seriousinsights.net/rail-cube-review/) — materials (ABS/POM, steel rods)
