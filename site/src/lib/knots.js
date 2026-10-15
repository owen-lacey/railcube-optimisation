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

/** mulberry32: a small seeded generator, so the projections are the same every run. */
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly random rotation (Shoemake's quaternion), as its three columns. */
function rotation(random) {
  const [u1, u2, u3] = [random(), random(), random()];
  const [x, y] = [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2)];
  const [z, w] = [Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)];
  const rows = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  return [0, 1, 2].map(c => rows.map(r => r[c]));
}

// Fixed, so every reading is offered the same ones in the same order. A proof does
// not need them random, only regular, which the tolerances look after.
const PROJECTIONS = (() => {
  const random = generator(7);
  return Array.from({ length: 32 }, () => rotation(random));
})();

const EPS = 1e-7;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const turned = (points, columns) => points.map(p => columns.map(c => dot(p, c)));

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

/**
 * How segments i (from flat[i]) and j meet in a projection: null if they do not,
 * 'overlap' if they lie on one line sharing more than a point, else where along
 * each they cross, as `{ s, t }`.
 */
function meet(flat, i, j) {
  const n = flat.length;
  const [a, b] = [flat[i], flat[j]];
  const [na, nb] = [flat[(i + 1) % n], flat[(j + 1) % n]];
  const di = [na[0] - a[0], na[1] - a[1]], dj = [nb[0] - b[0], nb[1] - b[1]];
  const w = [b[0] - a[0], b[1] - a[1]];
  const den = di[0] * dj[1] - di[1] * dj[0];
  const sn = w[0] * dj[1] - w[1] * dj[0];
  if (Math.abs(den) < 1e-12) {
    if (Math.abs(sn) >= 1e-9) return null;
    const length = di[0] * di[0] + di[1] * di[1];
    const u0 = (w[0] * di[0] + w[1] * di[1]) / length;
    const u1 = ((w[0] + dj[0]) * di[0] + (w[1] + dj[1]) * di[1]) / length;
    return Math.max(u0, u1) > EPS && Math.min(u0, u1) < 1 - EPS ? 'overlap' : null;
  }
  const s = sn / den, t = (w[0] * di[1] - w[1] * di[0]) / den;
  return s > -EPS && s < 1 + EPS && t > -EPS && t < 1 + EPS ? { s, t } : null;
}

/** Every pair of segments that are not neighbours on a closed polyline of n. */
function* pairs(n) {
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1)) yield [i, j];
  }
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
  const roles = [...pairs(at.length)].map(([a, b]) => {
    const [p, q] = [own[a], own[b]];
    const passes = p.kind !== 0 && q.kind !== 0 && p.kind !== q.kind;
    return {
      a, b, passes,
      centre: !passes && (p.middle || q.middle),
      between: !passes && p.side !== q.side,
      self: !passes && p.side === q.side ? p.side : -1,
    };
  });
  return PROJECTIONS.some(projection => {
    const flat = turned(at, projection);
    let all = 0, passes = 0, between = 0, centre = 0;
    const selves = [0, 0];
    for (const role of roles) {
      const hit = meet(flat, role.a, role.b);
      if (hit === 'overlap') return false;
      if (hit === null) continue;
      all += 1;
      if (role.passes) passes += 1;
      if (role.between) between += 1;
      if (role.centre) centre += 1;
      if (role.self >= 0) selves[role.self] += 1;
    }
    if (all < 3) return true;
    return passes === 1 && between === 0 && centre === 0 && selves.every(c => c < 3);
  });
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
  const flat = turned(points, projection);
  const n = flat.length;
  const height = (k, s) => flat[k][2] + s * (flat[(k + 1) % n][2] - flat[k][2]);
  const found = [];
  for (const [i, j] of pairs(n)) {
    const hit = meet(flat, i, j);
    if (hit === null) continue;
    if (hit === 'overlap') return null;
    const { s, t } = hit;
    if (s < EPS || s > 1 - EPS || t < EPS || t > 1 - EPS) return null;
    const [hi, hj] = [height(i, s), height(j, t)];
    if (Math.abs(hi - hj) < 1e-9) return null;
    found.push({ i, s, j, t, iOver: hi > hj });
  }
  return { flat, found };
}

/**
 * The Alexander polynomial of a closed polyline, as topoly writes it: its
 * coefficients by degree, lowest first, with powers of t stripped and the lowest
 * coefficient positive — '1' for an unknot, '1 -1 1' a trefoil.
 *
 * Read off the regular projection, of the fixed ones, with the fewest crossings,
 * since the determinant's cost grows with them. Each crossing gives one row of
 * the Alexander matrix: its over-arc 1 − t, and the arcs that run into and out of
 * it underneath t and −1, or −1 and t, by the crossing's sign. One row and one
 * column struck out, the determinant is the polynomial up to a unit ±tᵏ.
 */
export function alexander(points) {
  const at = merged(points, () => true).map(i => points[i]);
  const best = PROJECTIONS.map(p => crossingsIn(at, p))
    .filter(Boolean)
    .reduce((a, b) => (a && a.found.length <= b.found.length ? a : b), null);
  if (!best) throw new Error(`every one of ${PROJECTIONS.length} projections is degenerate`);
  const { flat, found } = best;
  const n = found.length;
  if (n === 0) return '1';

  // Every pass along the curve, in order, and the arcs between the under-passes.
  const passes = found.flatMap((c, k) => [
    { at: c.i + c.s, crossing: k, over: c.iOver },
    { at: c.j + c.t, crossing: k, over: !c.iOver },
  ]).sort((a, b) => a.at - b.at);
  const unders = passes.filter(p => !p.over);
  const arcOf = at => (unders.filter(u => u.at < at).length - 1 + n) % n;

  const m = flat.length;
  const along = k => [flat[(k + 1) % m][0] - flat[k][0], flat[(k + 1) % m][1] - flat[k][1]];
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
