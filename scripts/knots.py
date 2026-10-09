# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = ["topoly", "numpy", "scipy"]
# ///
"""The Alexander polynomial of closed curves, one JSON line in and one out.

    node scripts/hydrate-sweeps.js --knots ...   (which runs this, via knot-curves.js)
    echo '{"id": 1, "seed": 1, "curves": {"over": [[x, y, z], ...]}, "lobes": ["-A", ...]}' \
      | uv run scripts/knots.py [--topoly-only]

Before topoly, every reading is offered to a certificate, which can prove it an
unknot from a flat picture of it: up to PROJECTIONS fixed projections, the first
that shows either

  - fewer than 3 crossings in all — any diagram that small is an unknot; or
  - the two lobes (see `lobesOf` in knot-curves.js) crossing each other only once,
    where the cross's two passes meet, and each crossing itself fewer than 3 times.
    That crossing is then nugatory, the knot is the sum of the lobes' knots, and
    each of those is an unknot.

A cleared reading is answered `1`, the unknot's polynomial, without topoly. One
that is not is read by topoly as below, so the certificate can only ever say
"unknot" with a proof, never "knotted". Over every knotted row in sweeps.db
(39,845) it cleared none, bar one topoly had misread as a trefoil on one rotation
in 42; over 40,000 unknots it cleared 99.4%, at ~4.5 ms a layout against ~25 ms
for topoly. Crossings are counted with a small tolerance, so a near miss counts:
overcounting only costs a certificate. Two segments lying on one line in a
projection leave it unjudged if they overlap; pieces of one straight rail always
lie on one line and never overlap, so a straight run is first merged into one
segment, keeping every sample of the cross and every lobe boundary.
`--topoly-only` skips the certificate, which is what a recheck wants.

Every curve is rotated at random before topoly projects it. A track's rail runs
along the grid, and a projection lined up with the grid is degenerate: topoly
answers 0 for it, which it reads as a link (L8n8). The rotation is seeded by the
line's seed and the attempt, so an answer is reproducible. Two answers are
about the projection rather than the curve — 0, and ErrTMC — and both go away
on another rotation: over the prototype's scans every one was an unknot on a
retry, and a grid-snapped figure-eight gives ErrTMC on about half its rotations
and 1 -3 1 on the rest. So they are retried on a fresh rotation, only a real
polynomial is ever kept, and a curve that never gives one stops the run.

A third failure is a hang: some rotations send topoly round a loop it never
leaves (XIRSIOOIRISSRSRLSSXIOSSLILSSSLOIISSS, over, seed 8507057, on its first
rotation) and it is native code, so nothing in-process can interrupt it. So
topoly runs in a worker process, and a call that outlasts `--timeout` seconds
kills the worker and counts like 0 and ErrTMC: a fresh worker, a fresh
rotation. Twelve scans each stuck on such a curve all night is how this was
found. The clock starts once a worker has said it is ready: its imports take
about 0.6 s, and on a busy machine a timeout that also paid for them expired on
every rotation.

Track geometry is never computed here: the curves and their lobes come from the
JS (trackPath in site/src/lib/render/rail.js, via scripts/knot-curves.js), and
what the polynomials mean is decided there too. topoly and the certificate's
projections are all this adds.
"""

import argparse
import json
import multiprocessing
import sys
from types import SimpleNamespace

import numpy as np
import topoly
from scipy.spatial.transform import Rotation
from topoly import invariants

TRANSIENT = ('0', 'ErrTMC')
ATTEMPTS = 16

# The certificate's projections, fixed so that every reading is offered the same
# ones in the same order. A proof does not need them random, only regular, which
# the tolerance and the overlap rule look after.
PROJECTIONS = [Rotation.random(random_state=np.random.default_rng([7, k])).as_matrix()[:, :2]
               for k in range(32)]
EPS = 1e-7
KINDS = {'-': 0, 'x': 1, 'y': 2}


def merged(points, kind, side):
    """Which samples to keep: a straight run becomes one segment, but the cross's
    samples and any lobe boundary stay."""
    before, after = np.roll(points, 1, 0), np.roll(points, -1, 0)
    straight = np.linalg.norm(np.cross(points - before, after - points), axis=1) <= 1e-9
    inside = (kind == 0) & (np.roll(kind, 1) == 0) & (side == np.roll(side, 1))
    return ~(straight & inside)


class Pairs:
    """Every pair of segments that are not neighbours, and what each pair is to the
    certificate. Labels alone decide that, so it is done once per reading."""

    def __init__(self, kind, side, middle):
        n = len(kind)
        i, j = np.triu_indices(n, 2)
        keep = ~((i == 0) & (j == n - 1))
        self.i, self.j = i[keep], j[keep]
        a, b = self.i, self.j
        self.passes = (kind[a] != 0) & (kind[b] != 0) & (kind[a] != kind[b])
        other = ~self.passes
        self.centre = (middle[a] | middle[b]) & other
        self.between = other & (side[a] != side[b])
        self.selves = [other & (side[a] == s) & (side[b] == s) for s in (0, 1)]


def crossings(flat, pairs):
    """Which pairs cross in this projection, or None if two overlap on one line."""
    i, j = pairs.i, pairs.j
    d = np.roll(flat, -1, 0) - flat
    w = flat[j] - flat[i]
    den = d[i, 0] * d[j, 1] - d[i, 1] * d[j, 0]
    sn = w[:, 0] * d[j, 1] - w[:, 1] * d[j, 0]
    tn = w[:, 0] * d[i, 1] - w[:, 1] * d[i, 0]
    level = np.abs(den) < 1e-12
    if overlapping(flat, d, i[level & (np.abs(sn) < 1e-9)], j[level & (np.abs(sn) < 1e-9)]):
        return None
    with np.errstate(divide='ignore', invalid='ignore'):
        s, t = sn / den, tn / den
    return ~level & (s > -EPS) & (s < 1 + EPS) & (t > -EPS) & (t < 1 + EPS)


def overlapping(flat, d, a, b):
    """Whether any of these pairs, each on one line, share more than a point."""
    if not len(a):
        return False
    length = (d[a] * d[a]).sum(1)
    u0 = ((flat[b] - flat[a]) * d[a]).sum(1) / length
    u1 = ((flat[b] + d[b] - flat[a]) * d[a]).sum(1) / length
    return bool(((np.maximum(u0, u1) > EPS) & (np.minimum(u0, u1) < 1 - EPS)).any())


def proves_unknot(hit, pairs):
    if hit.sum() < 3:
        return True
    nugatory = (hit & pairs.passes).sum() == 1 and not (hit & pairs.between).any() \
        and not (hit & pairs.centre).any()
    return bool(nugatory and all((hit & own).sum() < 3 for own in pairs.selves))


def certified(points, lobes):
    """Whether some projection proves this reading an unknot."""
    kind = np.array([KINDS[label[0]] for label in lobes])
    side = np.array([0 if label[1] == 'A' else 1 for label in lobes])
    middle = np.array([label.endswith('!') for label in lobes])
    keep = merged(points, kind, side)
    points, pairs = points[keep], Pairs(kind[keep], side[keep], middle[keep])
    for projection in PROJECTIONS:
        hit = crossings(points @ projection, pairs)
        if hit is not None and proves_unknot(hit, pairs):
            return True
    return False


def alexander(conn):
    """The worker: say it is ready, then rotate each curve it is sent and answer with
    its polynomial, until the parent closes its end, which is how a run finishes.

    topoly ends every call with a gc.collect() of its own (topoly/invariants.py),
    once the answer is made: about half of a call's time, measured, spent on
    nothing the answer depends on. So topoly's module gets a collect that does
    nothing; Python's own collector still runs as it always does."""
    invariants.gc = SimpleNamespace(collect=lambda: 0)
    conn.send('ready')
    while True:
        try:
            points, seed, attempt = conn.recv()
        except EOFError:
            return
        rng = np.random.default_rng([seed, attempt])
        rotated = Rotation.random(random_state=rng).apply(np.array(points, float))
        conn.send(str(topoly.alexander(rotated.tolist(), closure=topoly.Closure.CLOSED, tries=1,
                                       translate=False, run_parallel=False)))


class Worker:
    """topoly in a child process, replaced whenever a call outlasts the timeout."""

    def __init__(self, timeout):
        self.timeout = timeout
        self.start()

    def start(self):
        self.conn, child = multiprocessing.Pipe()
        self.process = multiprocessing.Process(target=alexander, args=(child,), daemon=True)
        self.process.start()
        child.close()  # so a worker that dies starting is an EOFError here, not a wait
        self.conn.recv()  # 'ready'

    def call(self, points, seed, attempt):
        """The polynomial, or None if topoly hung on this rotation."""
        self.conn.send((points, seed, attempt))
        if self.conn.poll(self.timeout):
            return self.conn.recv()
        self.process.kill()
        self.process.join()
        self.start()
        return None


def polynomial(worker, points, seed):
    for attempt in range(ATTEMPTS):
        answer = worker.call(points, seed, attempt)
        if answer is not None and answer not in TRANSIENT:
            return answer
    raise RuntimeError(f'curve {seed} gave only {TRANSIENT} or hung over {ATTEMPTS} rotations')


def reading(worker, points, lobes, seed, certify):
    if certify and certified(np.array(points, float), lobes):
        return '1'
    return polynomial(worker, points, seed)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeout', type=float, default=10)
    parser.add_argument('--topoly-only', action='store_true')
    args = parser.parse_args()
    worker = Worker(args.timeout)
    for line in sys.stdin:
        record = json.loads(line)
        if any(len(points) != len(record['lobes']) for points in record['curves'].values()):
            raise ValueError(f"record {record['id']}: a curve and its lobes differ in length")
        polys = {name: reading(worker, points, record['lobes'], record['seed'], not args.topoly_only)
                 for name, points in record['curves'].items()}
        print(json.dumps({'id': record['id'], 'polys': polys}), flush=True)


if __name__ == '__main__':
    main()
