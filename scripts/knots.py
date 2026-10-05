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

Geometry is never computed here: the curves come from the JS (trackPath in
site/src/lib/render/rail.js, via scripts/knot-curves.js), and what the
polynomials mean is decided there too. topoly is the only thing this adds.
"""

import json
import sys

import numpy as np
import topoly
from scipy.spatial.transform import Rotation

TRANSIENT = ('0', 'ErrTMC')
ATTEMPTS = 16


def polynomial(points, seed):
    for attempt in range(ATTEMPTS):
        rng = np.random.default_rng([seed, attempt])
        rotated = Rotation.random(random_state=rng).apply(np.array(points, float))
        answer = str(topoly.alexander(rotated.tolist(), closure=topoly.Closure.CLOSED, tries=1,
                                      translate=False, run_parallel=False))
        if answer not in TRANSIENT:
            return answer
    raise RuntimeError(f'curve {seed} gave only {TRANSIENT} over {ATTEMPTS} rotations')


def main():
    for line in sys.stdin:
        record = json.loads(line)
        polys = {name: polynomial(points, record['seed']) for name, points in record['curves'].items()}
        print(json.dumps({'id': record['id'], 'polys': polys}), flush=True)


if __name__ == '__main__':
    main()
