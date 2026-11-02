// Is a track knotted? The rail's own curve, closed, and its Alexander polynomial,
// read in plain JavaScript so the browser can read one.
//
// The curve is trackPath (render/rail.js), the rail the viewers draw, sampled
// SAMPLES times a piece. The real cross is flat, so the curve meets itself there
// and, strictly, no track is knotted. So the cross's second pass is read twice:
// bumped BUMP units along its `up` (a cube is 20), times sin(πs) so it leaves and
// rejoins the rail smoothly — `over` — and the same bump downwards — `under`. A
// track is knotted if either reading is.
//
// A reading is first offered to a certificate (`certified`), which can prove it an
// unknot from a flat picture of it; one it cannot clear has its Alexander
// polynomial worked out from a projection (`alexander`). scripts/knots.py reads
// the same curves with topoly, for the sweeps; this is the same certificate,
// ported, and a polynomial of its own in place of topoly's.

import { trackPath } from './render/rail.js';
import { random } from './random.js';

export const SAMPLES = 8;
export const BUMP = 2;

const round = v => v.map(x => Math.round(x * 1000) / 1000);

/** The rail as two closed polylines, the cross's second pass lifted over or dropped under. */
export function curvesOf(placed) {
  const path = trackPath(placed, SAMPLES);
  const reading = sign => path.map(({ pos, up }, i) => {
    const piece = Math.floor(i / SAMPLES), s = (i % SAMPLES) / SAMPLES;
    if (!placed[piece].revisit) return round(pos);
    return round(pos.map((v, k) => v + sign * BUMP * Math.sin(Math.PI * s) * up[k]));
  });
  return { over: reading(1), under: reading(-1) };
}

/**
 * Each sample's place in the rail, as two letters and a mark: a kind (`x` the
 * cross's first pass, `y` its second, `-` any other piece) and a lobe (`A` from
 * the middle of the first pass round to the middle of the second, `B` the rest),
 * with `!` on the two samples either side of a pass's middle, where the passes
 * cross. A track without exactly one crossing has no lobes to split into, so
 * every sample is `-A`.
 */
export function lobesOf(placed) {
  const first = placed.findIndex(p => p.type === 'cross' && !p.revisit);
  const second = placed.findIndex(p => p.revisit);
  if (second === -1 || placed.filter(p => p.revisit).length !== 1) {
    return Array(placed.length * SAMPLES).fill('-A');
  }
  const n = placed.length;
  const inA = k => (k - first + n) % n < (second - first + n) % n;
  const middle = s => (s === SAMPLES / 2 - 1 || s === SAMPLES / 2 ? '!' : '');
  return placed.flatMap((_, k) => Array.from({ length: SAMPLES }, (__, s) => {
    const early = s < SAMPLES / 2;
    if (k === first) return (early ? 'xB' : 'xA') + middle(s);
    if (k === second) return (early ? 'yA' : 'yB') + middle(s);
    return inA(k) ? '-A' : '-B';
  }));
}

// Alexander polynomials as topoly writes them, coefficients by degree.
const TYPES = { '1': 'unknot', '1 -1 1': 'trefoil', '1 -3 1': 'figure-eight' };

/** A polynomial's knot, by name where it has one. */
export const knotType = poly => TYPES[poly] ?? `other:${poly}`;

/**
 * The track's knot, either reading. Both readings knotted has never been seen;
 * two different knots would leave nothing to call it, so that is an error.
 */
export function knotOf(over, under) {
  const knots = [...new Set([knotType(over), knotType(under)])].filter(k => k !== 'unknot');
  if (knots.length > 1) throw new Error(`knotted as ${knots.join(' and ')} by the two readings`);
  return knots[0] ?? 'unknot';
}

// ---------------------------------------------------------------------------
// Projections.

/** A uniformly random rotation (Shoemake's quaternion), as its three columns. */
function rotation(draw) {
  const [u1, u2, u3] = [draw(), draw(), draw()];
  const [x, y] = [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2)];
  const [z, w] = [Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)];
  const rows = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  return [0, 1, 2].map(c => rows.map(r => r[c]));
}

// Fixed — seeded, so the same every run — so every reading is offered the same
// ones in the same order. A proof does not need them random, only regular, which
// the tolerances look after.
const PROJECTIONS = (() => {
  const draw = random(7);
  return Array.from({ length: 32 }, () => rotation(draw));
})();

const EPS = 1e-7;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A closed polyline seen down the third of `columns`: its points' coordinates along
 * each, and each segment's box in the plane of the first two (see `boxesOf`).
 * @param {number[][]} points
 * @param {number[][]} columns
 */
function flatten(points, columns) {
  const [c0, c1, c2] = columns;
  const n = points.length;
  const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    x[k] = dot(points[k], c0);
    y[k] = dot(points[k], c1);
    z[k] = dot(points[k], c2);
  }
  return { n, x, y, z, box: boxesOf(x, y, n) };
}

/**
 * Each segment's box in the plane, `[left, right, bottom, top]` four to a segment,
 * padded by more than `meet`'s tolerances reach: EPS of its length past either end,
 * and the parallel test's 1e-9 over its length to either side. So two segments
 * whose boxes miss do not meet, and are never tried. A segment too short to bound
 * that way is boundless, and always tried.
 */
function boxesOf(x, y, n) {
  const box = new Float64Array(4 * n);
  for (let k = 0; k < n; k++) {
    const l = (k + 1) % n;
    const length = Math.hypot(x[l] - x[k], y[l] - y[k]);
    const pad = length < 1e-6 ? Infinity : 1e-6 * (1 + length) + 1e-8 / length;
    box[4 * k] = Math.min(x[k], x[l]) - pad;
    box[4 * k + 1] = Math.max(x[k], x[l]) + pad;
    box[4 * k + 2] = Math.min(y[k], y[l]) - pad;
    box[4 * k + 3] = Math.max(y[k], y[l]) + pad;
  }
  return box;
}

/** Whether segments i and j's boxes miss each other. */
const apart = (box, i, j) => box[4 * i] > box[4 * j + 1] || box[4 * j] > box[4 * i + 1]
  || box[4 * i + 2] > box[4 * j + 3] || box[4 * j + 2] > box[4 * i + 3];

/**
 * Call `visit(i, j)` for every pair of segments that are not neighbours on the
 * closed polyline and whose boxes meet, i before j, until it returns false.
 * Whether it ran to the end.
 */
function eachNear({ n, box }, visit) {
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (!apart(box, i, j) && visit(i, j) === false) return false;
    }
  }
  return true;
}

/**
 * The indices of the samples to keep: where `mergeable(i)`, a sample on a straight
 * line between its neighbours goes, so a straight run is one segment. Pieces of
 * one straight rail lie on one line in every projection, and two such segments
 * would make every projection look degenerate.
 */
function merged(points, mergeable) {
  const n = points.length;
  return points.flatMap((p, i) => {
    const before = points[(i + n - 1) % n], after = points[(i + 1) % n];
    const u = p.map((v, k) => v - before[k]), v = after.map((x, k) => x - p[k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return Math.hypot(...cross) <= 1e-9 && mergeable(i) ? [] : [i];
  });
}

const OVERLAP = 'overlap';

/**
 * How segments i (from point i) and j of a flattened polyline meet: null if they
 * do not, OVERLAP if they lie on one line sharing more than a point, else where
 * along each they cross, as `{ s, t }`.
 */
function meet({ n, x, y }, i, j) {
  const ni = (i + 1) % n, nj = (j + 1) % n;
  const dix = x[ni] - x[i], diy = y[ni] - y[i];
  const djx = x[nj] - x[j], djy = y[nj] - y[j];
  const wx = x[j] - x[i], wy = y[j] - y[i];
  const den = dix * djy - diy * djx;
  const sn = wx * djy - wy * djx;
  if (Math.abs(den) < 1e-12) {
    if (Math.abs(sn) >= 1e-9) return null;
    return alongside(dix, diy, djx, djy, wx, wy) ? OVERLAP : null;
  }
  const s = sn / den, t = (wx * diy - wy * dix) / den;
  return s > -EPS && s < 1 + EPS && t > -EPS && t < 1 + EPS ? { s, t } : null;
}

/** Whether two segments on one line, j `w` from i, share more than a point. */
function alongside(dix, diy, djx, djy, wx, wy) {
  const length = dix * dix + diy * diy;
  const u0 = (wx * dix + wy * diy) / length;
  const u1 = ((wx + djx) * dix + (wy + djy) * diy) / length;
  return Math.max(u0, u1) > EPS && Math.min(u0, u1) < 1 - EPS;
}

// ---------------------------------------------------------------------------
// The certificate.

const KINDS = { '-': 0, x: 1, y: 2 };

/**
 * Whether some projection proves this reading an unknot: the first that shows
 * either fewer than 3 crossings in all — any diagram that small is an unknot — or
 * the two lobes crossing each other only once, where the cross's two passes meet,
 * and each crossing itself fewer than 3 times. That crossing is then nugatory, the
 * knot is the sum of the lobes' knots, and each of those is an unknot. Crossings
 * are counted with a small tolerance, so a near miss counts: overcounting only
 * costs a certificate. It can only ever say "unknot", never "knotted".
 */
export function certified(points, lobes) {
  const labels = lobes.map(label => ({
    kind: KINDS[label[0]], side: label[1] === 'A' ? 0 : 1, middle: label.endsWith('!'),
  }));
  const n = points.length;
  // Every sample of the cross and every lobe boundary stays.
  const inside = i => labels[i].kind === 0 && labels[(i + n - 1) % n].kind === 0
    && labels[i].side === labels[(i + n - 1) % n].side;
  const index = merged(points, inside);
  const at = index.map(i => points[i]);
  const own = index.map(i => labels[i]);
  return PROJECTIONS.some(projection => clears(flatten(at, projection), own));
}

/** Whether one projection, `flat`, of a reading labelled `own` proves it an unknot. */
function clears(flat, own) {
  const count = { all: 0, passes: 0, between: 0, centre: 0, selves: [0, 0] };
  const regular = eachNear(flat, (a, b) => {
    const hit = meet(flat, a, b);
    if (hit === OVERLAP) return false;
    if (hit !== null) tally(count, own[a], own[b]);
    return true;
  });
  if (!regular) return false;
  if (count.all < 3) return true;
  return count.passes === 1 && count.between === 0 && count.centre === 0 && count.selves.every(c => c < 3);
}

/** Count a crossing between samples labelled `p` and `q`: in all, and by what it is between. */
function tally(count, p, q) {
  count.all += 1;
  if (p.kind !== 0 && q.kind !== 0 && p.kind !== q.kind) {
    count.passes += 1;
    return;
  }
  if (p.middle || q.middle) count.centre += 1;
  if (p.side !== q.side) count.between += 1;
  else count.selves[p.side] += 1;
}

// ---------------------------------------------------------------------------
// The Alexander polynomial, from a diagram.
//
// Polynomials in t are arrays of BigInt coefficients by degree, lowest first.
// BigInt because the determinant's intermediate minors are not bounded by
// anything a double can promise to hold exactly.

const trim = p => {
  let end = p.length;
  while (end > 0 && p[end - 1] === 0n) end -= 1;
  return p.slice(0, end);
};
const plus = (a, b) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, k) => (a[k] ?? 0n) + (b[k] ?? 0n)));
const minus = (a, b) => plus(a, b.map(c => -c));
const times = (a, b) => {
  if (!a.length || !b.length) return [];
  const out = Array(a.length + b.length - 1).fill(0n);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return trim(out);
};

/** a / b, which must divide exactly — over ℤ[t] every step's leading division is then exact. */
function over(a, b) {
  const rest = [...a];
  const out = Array(Math.max(a.length - b.length + 1, 0)).fill(0n);
  for (let k = a.length - b.length; k >= 0; k--) {
    const lead = rest[k + b.length - 1];
    if (lead % b[b.length - 1] !== 0n) throw new Error('a Bareiss step did not divide exactly');
    const q = lead / b[b.length - 1];
    out[k] = q;
    b.forEach((c, i) => { rest[k + i] -= q * c; });
  }
  if (trim(rest).length) throw new Error('a Bareiss step did not divide exactly');
  return trim(out);
}

/**
 * The determinant of a square matrix over ℤ[t], by fraction-free (Bareiss) elimination.
 * @returns {bigint[]}
 */
function determinant(matrix) {
  const m = matrix.map(row => [...row]);
  const n = m.length;
  let sign = 1n, previous = [1n];
  for (let k = 0; k < n - 1; k++) {
    if (!m[k][k].length) {
      const swap = m.findIndex((row, r) => r > k && row[k].length);
      if (swap === -1) return [];
      [m[k], m[swap]] = [m[swap], m[k]];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) {
        m[i][j] = over(minus(times(m[i][j], m[k][k]), times(m[i][k], m[k][j])), previous);
      }
    }
    previous = m[k][k];
  }
  return n ? m[n - 1][n - 1].map(c => sign * c) : [1n];
}

/**
 * Where a closed polyline crosses itself, seen down the third column of
 * `projection`: `{ i, s, j, t, iOver }` each, segment i at s crossing segment j at
 * t. Null if the projection is degenerate — two segments overlapping on one line,
 * a crossing at a vertex, or the curve really meeting itself.
 */
function crossingsIn(points, projection) {
  const flat = flatten(points, projection);
  const found = [];
  const regular = eachNear(flat, (i, j) => {
    const hit = meet(flat, i, j);
    if (hit === null) return true;
    const crossing = hit !== OVERLAP && crossingAt(flat, i, j, hit);
    if (crossing) found.push(crossing);
    return Boolean(crossing);
  });
  return regular ? { flat, found } : null;
}

/**
 * Segment i at s crossing segment j at t, `{ i, s, j, t, iOver }`, or null if the
 * crossing is at a vertex or the curve really meets itself there.
 */
function crossingAt({ n, z }, i, j, { s, t }) {
  if (s < EPS || s > 1 - EPS || t < EPS || t > 1 - EPS) return null;
  const height = (k, along) => z[k] + along * (z[(k + 1) % n] - z[k]);
  const [hi, hj] = [height(i, s), height(j, t)];
  if (Math.abs(hi - hj) < 1e-9) return null;
  return { i, s, j, t, iOver: hi > hj };
}

/**
 * The regular projection of `points`, of the fixed ones, with the fewest crossings,
 * the first of them on a tie — or null as soon as one shows fewer than 3, since
 * any diagram that small is an unknot and there is nothing to work out.
 */
function fewestCrossings(points) {
  let best = null;
  for (const projection of PROJECTIONS) {
    const seen = crossingsIn(points, projection);
    if (!seen) continue;
    if (seen.found.length < 3) return null;
    if (!best || seen.found.length < best.found.length) best = seen;
  }
  if (!best) throw new Error(`every one of ${PROJECTIONS.length} projections is degenerate`);
  return best;
}

/**
 * The Alexander polynomial of a closed polyline, as topoly writes it: its
 * coefficients by degree, lowest first, with powers of t stripped and the lowest
 * coefficient positive — '1' for an unknot, '1 -1 1' a trefoil.
 *
 * Read off the regular projection, of the fixed ones, with the fewest crossings,
 * since the determinant's cost grows with them, and '1' at once from the first
 * with fewer than 3. Each crossing gives one row of
 * the Alexander matrix: its over-arc 1 − t, and the arcs that run into and out of
 * it underneath t and −1, or −1 and t, by the crossing's sign. One row and one
 * column struck out, the determinant is the polynomial up to a unit ±tᵏ.
 */
export function alexander(points) {
  const best = fewestCrossings(merged(points, () => true).map(i => points[i]));
  if (!best) return '1';
  const { flat, found } = best;
  const n = found.length;

  // Every pass along the curve, in order, and the arcs between the under-passes.
  const passes = found.flatMap((c, k) => [
    { at: c.i + c.s, crossing: k, over: c.iOver },
    { at: c.j + c.t, crossing: k, over: !c.iOver },
  ]).sort((a, b) => a.at - b.at);
  const unders = passes.filter(p => !p.over);
  const arcOf = at => (unders.filter(u => u.at < at).length - 1 + n) % n;

  const { n: m, x, y } = flat;
  const along = k => [x[(k + 1) % m] - x[k], y[(k + 1) % m] - y[k]];
  const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => []));
  unders.forEach((under, k) => {
    const c = found[under.crossing];
    const overPass = passes.find(p => p.over && p.crossing === under.crossing);
    const [o, u] = c.iOver ? [along(c.i), along(c.j)] : [along(c.j), along(c.i)];
    const positive = o[0] * u[1] - o[1] * u[0] > 0;
    const into = (k - 1 + n) % n, outOf = k;
    const row = matrix[k];
    const add = (arc, p) => { row[arc] = plus(row[arc], p); };
    add(arcOf(overPass.at), [1n, -1n]);
    add(into, positive ? [0n, 1n] : [-1n]);
    add(outOf, positive ? [-1n] : [0n, 1n]);
  });

  const minor = matrix.slice(0, -1).map(row => row.slice(0, -1));
  let poly = determinant(minor);
  while (poly.length && poly[0] === 0n) poly = poly.slice(1);
  if (poly[0] < 0n) poly = poly.map(c => -c);
  const atOne = poly.reduce((a, b) => a + b, 0n);
  if (atOne !== 1n && atOne !== -1n) {
    throw new Error(`Δ(1) is ${atOne}, not ±1: the diagram was read wrong`);
  }
  return poly.join(' ');
}

/** One reading's polynomial: '1' if the certificate clears it, else its Alexander polynomial. */
const polynomialOf = (points, lobes) => (certified(points, lobes) ? '1' : alexander(points));

/** The knot a closed track's rail makes: 'unknot', 'trefoil', 'figure-eight' or 'other:…'. */
export function readKnot(placed) {
  const { over, under } = curvesOf(placed);
  const lobes = lobesOf(placed);
  return knotOf(polynomialOf(over, lobes), polynomialOf(under, lobes));
}
