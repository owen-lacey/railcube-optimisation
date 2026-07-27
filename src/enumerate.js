// Brute-force enumeration of closed loops: the reference the CP-SAT model gets
// checked against. Deliberately plain depth-first search — when this and the
// solver disagree, the suspicion should fall on the clever one.
//
// It knows nothing about the cross being traversable twice. A cross here is just
// a straight that costs a cross, which is exactly how the real model treats one
// that is placed but not crossed.

import { PIECE_TYPES, POSES, cellsFor, step, POOL_OF, POOLS } from './track.js';

const key = cell => cell.join(',');
const l1 = cell => Math.abs(cell[0]) + Math.abs(cell[1]) + Math.abs(cell[2]);

/** The largest L1 displacement any one piece makes — the curves, at 2 + 1. */
const MAX_REACH = 3;

/**
 * Fewest pieces that can bring each pose back to `goal`, ignoring position
 * entirely. A 24-state backward breadth-first search, so it is admissible: if a
 * pose is 3 moves from home there is no point exploring it with 2 pieces left.
 */
function poseDistances(goal) {
  const dist = new Map([[goal, 0]]);
  for (let frontier = [goal]; frontier.length; ) {
    const next = [];
    for (const to of frontier) {
      for (const from of POSES) {
        if (dist.has(from)) continue;
        if (PIECE_TYPES.some(type => step([0, 0, 0], from, type).pose === to)) {
          dist.set(from, dist.get(to) + 1);
          next.push(from);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Claim a piece's cells, or return null if they are not free. */
function claim(board, piece, checkTrain) {
  const material = piece.material.map(key);
  const train = checkTrain ? piece.train.map(key) : [];
  for (const k of material) {
    if (board.solid.has(k)) return null;
    if (checkTrain && board.train.has(k)) return null;
  }
  for (const k of train) if (board.solid.has(k)) return null;

  for (const k of material) board.solid.add(k);
  for (const k of train) board.train.set(k, (board.train.get(k) ?? 0) + 1);
  return { material, train };
}

/** Stands in for a claim when collision checking is off — nothing to undo. */
const EMPTY_CLAIM = { material: [], train: [] };

function release(board, claimed) {
  for (const k of claimed.material) board.solid.delete(k);
  for (const k of claimed.train) {
    const n = board.train.get(k) - 1;
    if (n) board.train.set(k, n); else board.train.delete(k);
  }
}

const inBounds = (piece, box, minY) =>
  piece.material.every(c =>
    c.every(v => Math.abs(v) <= box) && (minY === null || c[1] >= minY));

/**
 * Every closed loop that fits the given rules, as arrays of piece types.
 *
 *   inventory   pool counts, e.g. STARTER
 *   maxPieces   search depth
 *   minPieces   ignore loops shorter than this (they are still found)
 *   box         no material cell further than this from the origin on any axis
 *   minY        floor; null for none. 0 means nothing below the ground
 *   collisions  enforce material collisions at all. Off is only useful for
 *               comparing against a partially-built solver model — a loop that
 *               passes through itself is not a track
 *   checkTrain  enforce clearance as well as material collisions
 *   exclude     piece types to leave out entirely
 *   sixFaces    only report loops whose rail reaches all six faces
 */
export function enumerateLoops({
  inventory, maxPieces, minPieces = 1, box = 6, minY = null,
  collisions = true, checkTrain = true, exclude = [], sixFaces = false, startPose = 'UF',
}) {
  const types = PIECE_TYPES.filter(t => !exclude.includes(t) && (inventory[POOL_OF[t]] ?? 0) > 0);
  const homeDist = poseDistances(startPose);
  const board = { solid: new Set(), train: new Map() };
  const spent = Object.fromEntries(POOLS.map(p => [p, 0]));
  const route = [];
  const faces = new Map();
  const found = [];

  // Can a head this far from home possibly get back in `left` more pieces?
  const reachable = (cell, pose, left) =>
    l1(cell) <= MAX_REACH * left && (homeDist.get(pose) ?? Infinity) <= left;

  const record = () => {
    if (route.length < minPieces) return;
    if (sixFaces && faces.size < 6) return;
    found.push([...route]);
  };

  function descend(cell, pose, left) {
    if (cell.every(v => v === 0) && pose === startPose) record();
    if (!left) return;

    for (const type of types) {
      const pool = POOL_OF[type];
      if (spent[pool] >= inventory[pool]) continue;

      const piece = { type, ...cellsFor(type, pose, cell) };
      if (!inBounds(piece, box, minY)) continue;
      const claimed = collisions ? claim(board, piece, checkTrain) : EMPTY_CLAIM;
      if (!claimed) continue;

      const head = step(cell, pose, type);
      if (reachable(head.cell, head.pose, left - 1)) {
        spent[pool] += 1;
        route.push(type);
        faces.set(pose[0], (faces.get(pose[0]) ?? 0) + 1);

        descend(head.cell, head.pose, left - 1);

        const n = faces.get(pose[0]) - 1;
        if (n) faces.set(pose[0], n); else faces.delete(pose[0]);
        route.pop();
        spent[pool] -= 1;
      }
      release(board, claimed);
    }
  }

  descend([0, 0, 0], startPose, maxPieces);
  return found;
}
