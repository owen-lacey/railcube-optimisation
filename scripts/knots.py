# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = ["topoly", "numpy", "scipy"]
# ///
"""The Alexander polynomial of closed curves, one JSON line in and one out.

    node scripts/hydrate-sweeps.js --knots ...   (which runs this, via knot-curves.js)
    echo '{"id": 1, "seed": 1, "curves": {"over": [[x, y, z], ...]}}' | uv run scripts/knots.py

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

Geometry is never computed here: the curves come from the JS (trackPath in
site/src/lib/render/rail.js, via scripts/knot-curves.js), and what the
polynomials mean is decided there too. topoly is the only thing this adds.
"""

import argparse
import json
import multiprocessing
import sys

import numpy as np
import topoly
from scipy.spatial.transform import Rotation

TRANSIENT = ('0', 'ErrTMC')
ATTEMPTS = 16


def alexander(conn):
    """The worker: say it is ready, then rotate each curve it is sent and answer with its polynomial."""
    conn.send('ready')
    while True:
        points, seed, attempt = conn.recv()
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeout', type=float, default=10)
    worker = Worker(parser.parse_args().timeout)
    for line in sys.stdin:
        record = json.loads(line)
        polys = {name: polynomial(worker, points, record['seed']) for name, points in record['curves'].items()}
        print(json.dumps({'id': record['id'], 'polys': polys}), flush=True)


if __name__ == '__main__':
    main()
