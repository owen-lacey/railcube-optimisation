// The Rail Cube track model: poses, the piece catalogue, and the two hard
// constraints. This is docs/coordinates.md in executable form and the single
// source of truth — both the solver and the visualisation spike import it.
//
// Everything here is in the project frame from docs/coordinates.md: x = right,
// y = up, z = forwards (away from the viewer). No rendering, no PolyCSS.

/** Project-frame vector for each direction letter (coordinates.md:20-24). */
export const PROJ = {
  R: [1, 0, 0], L: [-1, 0, 0],
  U: [0, 1, 0], D: [0, -1, 0],
  F: [0, 0, 1], B: [0, 0, -1],
};

export const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
export const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const letterOf = v => FACES.find(k => PROJ[k].every((c, i) => c === v[i]));

/**
 * A pose is FACE + HEADING. The rail's direction of travel lies flat along the
 * face it is mounted on, so the heading can never be the face letter or its
 * opposite — 24 valid poses out of 36 (coordinates.md:63-82).
 */
export const isValidPose = pose =>
  typeof pose === 'string' && pose.length === 2 &&
  FACES.includes(pose[0]) && FACES.includes(pose[1]) &&
  pose[1] !== pose[0] && pose[1] !== OPPOSITE[pose[0]];

/** All 24 valid poses — one per cube rotation. */
export const POSES = FACES.flatMap(face =>
  FACES.filter(heading => isValidPose(face + heading)).map(heading => face + heading));

/**
 * A pose as a letter → letter substitution: where each direction of a piece
 * authored in the canonical UF pose ends up once the piece is turned. Letters
 * name physical directions, so rotating a move is pure substitution.
 *
 * The cross product needs care. The project frame is LEFT-handed — with x=right
 * and y=up, right × up points at the viewer, but z is forwards, away from them.
 * So the train's right hand is `face × heading` here. Write it the other way
 * round (as a right-handed frame would) and every pose's right becomes left:
 * all curves mirror, every route still closes, and nothing throws.
 */
export function poseLetters(pose) {
  if (!isValidPose(pose)) throw new Error(`invalid pose ${pose}: heading must be perpendicular to face`);
  const map = { U: pose[0], F: pose[1], R: letterOf(cross3(PROJ[pose[0]], PROJ[pose[1]])) };
  for (const k of ['U', 'F', 'R']) map[OPPOSITE[k]] = OPPOSITE[map[k]];
  return map;
}

/**
 * Sum a set of letter weights (e.g. {L: 2, F: 1}) into a project-frame offset,
 * rotating each letter through `map` on the way.
 */
export const delta = (map, weights) => Object.entries(weights).reduce(
  (acc, [letter, n]) => acc.map((v, i) => v + n * PROJ[map[letter]][i]), [0, 0, 0]);

/**
 * The piece catalogue (coordinates.md:114-121 and :155-162), every row given for
 * a piece entered at UF. Entered in any other pose the row is simply rotated.
 *
 *   disp  — where the next empty cell is; the head convention, not the last cell
 *   exit  — the pose the next piece enters with
 *   foot  — the cells the piece's material fills, as offsets from its own cell
 *   train — the cells the train needs, same offsets. The rule is that the train
 *           fills the whole cell on the rail's face side, never the cube's own.
 */
export const MOVES = {
  straight: {
    disp: { F: 1 }, exit: 'UF',
    foot: [{}],
    train: [{ U: 1 }],
  },
  cross: {
    // Two rails on one face, but one train: both traversals want the same cell.
    disp: { F: 1 }, exit: 'UF',
    foot: [{}],
    train: [{ U: 1 }],
  },
  leftCurve: {
    disp: { L: 2, F: 1 }, exit: 'UL',
    foot: [{}, { F: 1 }, { L: 1 }, { L: 1, F: 1 }],
    // All four cells of the layer above, not three: the body is wider than the
    // rail, so its inner flank passes over the inside of the bend.
    train: [{ U: 1 }, { U: 1, F: 1 }, { U: 1, L: 1 }, { U: 1, L: 1, F: 1 }],
  },
  rightCurve: {
    disp: { R: 2, F: 1 }, exit: 'UR',
    foot: [{}, { F: 1 }, { R: 1 }, { R: 1, F: 1 }],
    train: [{ U: 1 }, { U: 1, F: 1 }, { U: 1, R: 1 }, { U: 1, R: 1, F: 1 }],
  },
  insideCurve: {
    disp: { U: 2, F: 1 }, exit: 'BU',
    foot: [{}, { F: 1 }, { U: 1 }, { U: 1, F: 1 }],
    // Nothing extra: the rail is on the concave face, so the train runs through
    // the hollow the arc's own 2×2 already claims.
    train: [],
  },
  outsideCurve: {
    disp: { D: 1 }, exit: 'FD',
    foot: [{}],
    // The train wraps the outside of the edge, sweeping the rest of the 2×2
    // around it: above, in front, and diagonally across the corner between.
    train: [{ U: 1 }, { U: 1, F: 1 }, { F: 1 }],
  },
};

export const PIECE_TYPES = Object.keys(MOVES);

/** The cells one placed piece claims: its material, and the clearance its train needs. */
export function cellsFor(type, pose, cell) {
  const move = MOVES[type];
  if (!move) throw new Error(`unknown piece type ${type}`);
  const map = poseLetters(pose);
  const at = offset => delta(map, offset).map((v, k) => v + cell[k]);
  return { material: move.foot.map(at), train: move.train.map(at) };
}

/** Where the head goes after clicking `type` into it: the next empty cell and its pose. */
export function step(cell, pose, type) {
  const move = MOVES[type];
  if (!move) throw new Error(`unknown piece type ${type}`);
  const map = poseLetters(pose);
  const d = delta(map, move.disp);
  return {
    cell: cell.map((v, k) => v + d[k]),
    pose: map[move.exit[0]] + map[move.exit[1]],
  };
}

/**
 * The second hard constraint, in full (coordinates.md:140-183):
 *
 *   - at most one piece per cell, and
 *   - no cell is ever both material and train.
 *
 * Train cells may freely coincide with each other — there is only one train, so
 * two pieces wanting the same clearance cell costs nothing. That asymmetry is
 * what makes the cross legal at all.
 */
export function assertNoCollisions(placed) {
  const solid = new Map();
  for (const piece of placed) {
    for (const cell of piece.material) {
      const key = cell.join(',');
      const other = solid.get(key);
      if (other) throw new Error(`collision at cell ${key}: ${other.type} and ${piece.type}`);
      solid.set(key, piece);
    }
  }
  for (const piece of placed) {
    for (const cell of piece.train) {
      const other = solid.get(cell.join(','));
      if (other) {
        throw new Error(
          `clearance conflict at cell ${cell.join(',')}: ${other.type} blocks the train on ${piece.type}`);
      }
    }
  }
}

/**
 * Is this step the train coming back through a cross it has already been
 * through — the same cross, on the same face, crossing its own path?
 *
 * A cross is one piece with two rails, so the train passes over it twice. The
 * second pass places nothing: it is the same cube. The headings must be
 * perpendicular, because two visits on the same or opposite headings would be
 * the same rail, not a crossing.
 *
 * Worked out from the geometry rather than declared by the caller, so that a
 * route cannot claim a revisit it has not earned. That is what makes chainTrack
 * an independent check on the solver's piece count.
 */
function isRevisit(type, cell, pose, placedAt) {
  if (type !== 'cross') return false;
  const already = placedAt.get(cell.join(','));
  return Boolean(already)
    && already.type === 'cross'
    && already.pose[0] === pose[0]
    && already.pose[1] !== pose[1]
    && already.pose[1] !== OPPOSITE[pose[1]];
}

/**
 * Unroll a route into placed pieces, throwing unless it is a legal track. The
 * loop closes exactly when the head comes back to the start cell *and* pose —
 * returning with the wrong face or heading means the last piece cannot click
 * into the first.
 *
 * A route is the order the train travels, so a crossed cross appears in it
 * twice. The second appearance is marked `revisit` and claims nothing — no
 * material, and no clearance beyond what the first pass already asked for.
 */
export function chainTrack(route, startPose = 'UF') {
  let cell = [0, 0, 0], pose = startPose;
  const placedAt = new Map();
  const placed = route.map(type => {
    const revisit = isRevisit(type, cell, pose, placedAt);
    const claims = revisit ? { material: [], train: [] } : cellsFor(type, pose, cell);
    const piece = { cell, pose, type, revisit, ...claims };
    if (!revisit) placedAt.set(cell.join(','), piece);
    ({ cell, pose } = step(cell, pose, type));
    return piece;
  });
  if (cell.some(v => v !== 0) || pose !== startPose) {
    throw new Error(`route does not close: head at ${cell.join(',')} pose ${pose}, wanted 0,0,0 ${startPose}`);
  }
  assertNoCollisions(placed);
  return placed;
}

/**
 * What the sets ship (pieces.md:144-156). Keyed by *inventory pool*, not by piece
 * type: the green and blue flat curves are counted together in the product
 * listings ("8/16 combined"), so they draw from one shared pool. The white start
 * cube is geometrically a straight and is counted as one.
 */
export const POOL_OF = {
  straight: 'straight',
  cross: 'cross',
  leftCurve: 'flatCurve',
  rightCurve: 'flatCurve',
  insideCurve: 'insideCurve',
  outsideCurve: 'outsideCurve',
};

export const POOLS = [...new Set(Object.values(POOL_OF))];

export const STARTER = { straight: 16, flatCurve: 8, insideCurve: 4, outsideCurve: 4, cross: 0 };
export const DELUXE = { straight: 32, flatCurve: 16, insideCurve: 8, outsideCurve: 8, cross: 2 };

/**
 * Count entries in a route by inventory pool. Counts the traversal, so a crossed
 * cross counts twice — use countPieces for what is actually spent out of the box.
 */
export function countPools(route) {
  const used = Object.fromEntries(POOLS.map(p => [p, 0]));
  for (const type of route) used[POOL_OF[type]] += 1;
  return used;
}

/**
 * Count the physical pieces a chained track spends, by inventory pool. This is
 * the count an inventory limit or a "dropped pieces" objective must use: a
 * crossed cross is in the route twice and in the box once, and counting the
 * route instead is how a model mints pieces it does not own.
 */
export function countPieces(placed) {
  const used = Object.fromEntries(POOLS.map(p => [p, 0]));
  for (const piece of placed) if (!piece.revisit) used[POOL_OF[piece.type]] += 1;
  return used;
}

/**
 * Does this route fit in this inventory? Returns the pool that overflows, or
 * null. Counts physical pieces, so it chains the route — which means the route
 * has to be a legal closed track.
 */
export function overflowingPool(route, inventory, startPose = 'UF') {
  const used = countPieces(chainTrack(route, startPose));
  return POOLS.find(pool => used[pool] > (inventory[pool] ?? 0)) ?? null;
}

/** The same question for a list of piece types that need not close. */
export function overflowingPoolByType(route, inventory) {
  const used = countPools(route);
  return POOLS.find(pool => used[pool] > (inventory[pool] ?? 0)) ?? null;
}
