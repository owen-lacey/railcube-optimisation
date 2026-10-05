# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Crossed full-spend layouts by meeting in the middle, with no solver at all.

    uv run scripts/meet.py --set '{"straight":4,"leftCurve":3,"rightCurve":3,"cross":1}' \\
        --box 3 --exhaustive
    uv run scripts/meet.py --box 8 --rounds 0 --out sweep-crossed-meet.jsonl --set \\
        '{"straight":14,"cross":1,"insideCurve":8,"outsideCurve":4,"leftCurve":4,"rightCurve":4}'

Every piece type is a fixed motion of the grid — a turn and a shift — and a
route closes exactly when the product of its pieces is the identity. So rather
than search for whole routes, this grows short collision-free walks and joins
the ones whose ends meet. Collisions are the part the algebra cannot see, so
every join is checked against the claims of everything it joins.

The route is read from the cross: X · A · X · B. The first pass is entered
with the train at the origin in DF; lobe A runs from its exit back to the
origin in a pose that crosses it (DL or DR, as isRevisit decides); the second
pass; and lobe B runs home to DF. Both lobes start and end at the cross, so each is a path between
two fixed states and is itself a join of two halves — four quarters in all.
Reading the same track from its other pass swaps the lobes and turns DL into
DR, which is why drawing A no longer than B, with both headings, misses nothing.

Every half is a walk from DF at the origin, keyed by the state it ends in.
Halves are therefore frame-free: one pool per length serves both lobes and
both ends of a lobe, and the pair (u, v) closes a lobe that runs from s to t
exactly when end(v) = end(u)⁻¹ · s⁻¹ · t. The cost of that is that a half
cannot see the cross or the real box while it grows — only its own claims and
a span cap — so those are checked at the join.

The track is built in the cross's frame, and the question's frame (the start
cube at the origin with the train on it in DF, nothing below it, everything
within the box) is
chosen afterwards: each piece is tried as the start until one reading fits.
Pinning the start to the cross instead would reach only the tracks whose cross
lies face up on the ground, about 39% of the known ones.

`--run k` asks only for tracks holding at least k straights in a row. A run
lies inside one lobe, and reading from the other pass swaps the lobes, so it
is put in lobe B, which is then half · S^k · half: the run is one fixed motion
and only the halves either side of it are searched. That gives up drawing A no
longer than B.

Geometry comes from `node scripts/export-geometry.js` on every run, and the
rotations it exports are checked against its transition table before anything
is built. Every layout this prints or records has been re-chained by
`node scripts/check-route.js --stdin`, one process kept for the whole run; a
disagreement exits nonzero.
"""

import argparse
import itertools
import json
import random
import subprocess
import sys
import time
from collections import defaultdict, namedtuple
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
START = "DF"
ORIGIN = (0, 0, 0)
OFF, WIDTH = 512, 1024  # a cell packs into one int; walks here stay far inside ±OFF
DEFAULT_HALVES = 20000

Half = namedtuple("Half", "letters counts end")
Pool = namedtuple("Pool", "halves by_end")
Claims = namedtuple("Claims", "solid wanted")
Lobe = namedtuple("Lobe", "letters counts claims")


def run_node(script, *args):
    done = subprocess.run(["node", script, *args], cwd=REPO, capture_output=True, text=True)
    if done.returncode != 0:
        raise SystemExit(f"{script} {' '.join(args)} failed:\n{done.stderr}")
    return done.stdout


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def pack(c):
    return ((c[0] + OFF) * WIDTH + c[1] + OFF) * WIDTH + c[2] + OFF


def unpack(k):
    return (k // (WIDTH * WIDTH) - OFF, k // WIDTH % WIDTH - OFF, k % WIDTH - OFF)


class Geometry:
    """The export, indexed. A pose or piece type is its index in it, and a state
    — a head, or a whole motion — is a (cell, pose) pair."""

    def __init__(self, raw):
        self.poses, self.types = raw["poses"], raw["pieceTypes"]
        self.letter = [raw["letters"][t] for t in self.types]
        self.score = [raw["scores"][t] for t in self.types]
        self.cross, self.start = self.types.index("cross"), self.poses.index(START)
        # Where the question puts the train: one cell off the start cube at the origin.
        self.home = tuple(raw["startCells"][self.start])
        self.revisits = raw["crossRevisits"]
        self.rot = [tuple(map(tuple, r)) for r in raw["rotations"]]
        self.material = [[list(map(tuple, c)) for c in by] for by in raw["cells"]["material"]]
        self.train = [[list(map(tuple, c)) for c in by] for by in raw["cells"]["train"]]
        self.disp = [[None] * len(self.types) for _ in self.poses]
        self.next = [[None] * len(self.types) for _ in self.poses]
        for row in raw["transitions"]:
            self.disp[row["pose"]][row["type"]] = (row["dx"], row["dy"], row["dz"])
            self.next[row["pose"]][row["type"]] = row["nextPose"]
        by_matrix = {r: i for i, r in enumerate(self.rot)}
        self.compose = [[by_matrix[tuple(self.turn(p, v) for v in self.rot[q])]
                         for q in range(len(self.poses))] for p in range(len(self.poses))]
        self.inverse = [row.index(self.start) for row in self.compose]

    def turn(self, p, v):
        r, u, f = self.rot[p]
        return tuple(v[0] * r[i] + v[1] * u[i] + v[2] * f[i] for i in range(3))

    def unturn(self, p, v):
        return tuple(v[0] * a[0] + v[1] * a[1] + v[2] * a[2] for a in self.rot[p])

    def then(self, s, t):
        """Motion s followed by t, t being expressed in s's frame."""
        return (add(s[0], self.turn(s[1], t[0])), self.compose[s[1]][t[1]])

    def invert(self, s):
        return (tuple(-v for v in self.unturn(s[1], s[0])), self.inverse[s[1]])

    def step(self, s, t):
        return (add(s[0], self.disp[s[1]][t]), self.next[s[1]][t])

    def cells(self, s, t):
        c, p = s
        return [add(c, o) for o in self.material[p][t]], [add(c, o) for o in self.train[p][t]]


def load_geometry():
    geo = Geometry(json.loads(run_node("scripts/export-geometry.js")))
    check_rotations(geo)
    check_parity(geo)
    return geo


def check_rotations(geo):
    """The rotations are only believed once they reproduce step and cellsFor: every
    row of the table must be the DF row turned by its pose."""
    if geo.rot[geo.start] != ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        raise SystemExit(f"{START} is not the identity rotation")
    for p, t in itertools.product(range(len(geo.poses)), range(len(geo.types))):
        moved = (geo.turn(p, geo.disp[geo.start][t]), geo.compose[p][geo.next[geo.start][t]])
        cells = [[geo.turn(p, c) for c in table[geo.start][t]] for table in (geo.material, geo.train)]
        if moved != (geo.disp[p][t], geo.next[p][t]) or cells != [geo.material[p][t],
                                                                   geo.train[p][t]]:
            raise SystemExit(f"rotations disagree with the table at {geo.poses[p]} {geo.types[t]}")


def check_parity(geo):
    """Lobe lengths are drawn by parity, which holds only while every piece moves
    the head an odd number of cells (the checkerboard argument in CLAUDE.md)."""
    if any(sum(map(abs, d)) % 2 == 0 for row in geo.disp for d in row):
        raise SystemExit("a piece moves the head an even distance; lobe parity no longer holds")


# ---- growing halves -------------------------------------------------------

class Board:
    """createClaims for one walk as it grows — material may not meet material or
    any train — plus a cap on how far the material spans along each axis."""

    def __init__(self, reach):
        self.solid, self.wanted = set(), set()
        self.lo, self.hi = [OFF] * 3, [-OFF] * 3
        self.reach = reach

    def fits(self, mat, trn):
        keys = [pack(c) for c in mat]
        if any(k in self.solid or k in self.wanted for k in keys):
            return False
        if any(pack(c) in self.solid for c in trn):
            return False
        return all(max(self.hi[a], c[a]) - min(self.lo[a], c[a]) <= self.reach
                   for c in mat for a in range(3))

    def add(self, mat, trn):
        """Claim the cells, returning what undo needs to give them back."""
        token = (self.lo[:], self.hi[:], [pack(c) for c in mat],
                 [k for k in map(pack, trn) if k not in self.wanted])
        self.solid.update(token[2])
        self.wanted.update(token[3])
        for c in mat:
            self.lo = [min(v, x) for v, x in zip(self.lo, c)]
            self.hi = [max(v, x) for v, x in zip(self.hi, c)]
        return token

    def undo(self, token):
        self.lo, self.hi = token[0], token[1]
        self.solid.difference_update(token[2])
        self.wanted.difference_update(token[3])


def sample_half(geo, n, p, rng):
    """One random walk of n pieces from DF at the origin, choosing uniformly among
    the pieces that fit; None if it runs into a dead end."""
    board, state = Board(p.reach), (ORIGIN, geo.start)
    letters, counts = [], [0] * len(geo.types)
    for _ in range(n):
        for t in rng.sample(p.kinds, len(p.kinds)):
            if counts[t] >= p.cap[t]:
                continue
            mat, trn = geo.cells(state, t)
            if board.fits(mat, trn):
                break
        else:
            return None
        board.add(mat, trn)
        letters.append(t)
        counts[t] += 1
        state = geo.step(state, t)
    return Half(tuple(letters), tuple(counts), state)


def sample_pool(geo, n, p, rng, stats):
    halves = {}
    for _ in range(p.halves):
        half = sample_half(geo, n, p, rng)
        if half is None:
            stats["dead"] += 1
        else:
            halves[half.letters] = half
    stats["halves"] += len(halves)
    return indexed(halves)


def all_pools(geo, depth, p):
    """Every walk up to `depth` pieces, by length — the exhaustive counterpart."""
    pools = [{} for _ in range(depth + 1)]
    board, letters, counts = Board(p.reach), [], [0] * len(geo.types)

    def descend(state):
        pools[len(letters)][tuple(letters)] = Half(tuple(letters), tuple(counts), state)
        if len(letters) == depth:
            return
        for t in p.kinds:
            mat, trn = geo.cells(state, t)
            if counts[t] >= p.cap[t] or not board.fits(mat, trn):
                continue
            token = board.add(mat, trn)
            letters.append(t)
            counts[t] += 1
            descend(geo.step(state, t))
            counts[t] -= 1
            letters.pop()
            board.undo(token)

    descend((ORIGIN, geo.start))
    return [indexed(halves) for halves in pools]


def indexed(halves):
    by_end = defaultdict(list)
    for half in halves.values():
        by_end[half.end].append(half)
    return Pool(halves, by_end)


# ---- joining --------------------------------------------------------------

def place(geo, letters, state):
    """A walk's claims when it starts from `state`, and where it ends."""
    solid, wanted = set(), set()
    for t in letters:
        mat, trn = geo.cells(state, t)
        solid.update(map(pack, mat))
        wanted.update(map(pack, trn))
        state = geo.step(state, t)
    return Claims(frozenset(solid), frozenset(wanted)), state


def clash(a, b):
    """The collision rule between two sets of pieces that are each already clean.
    It is pairwise, so this is createClaims over their union."""
    return not (a.solid.isdisjoint(b.solid) and a.solid.isdisjoint(b.wanted)
                and a.wanted.isdisjoint(b.solid))


def lobe_specs(geo, steps, a, revisit):
    """(start, target, length) of each lobe, in the cross's frame."""
    home, again = (ORIGIN, geo.start), (ORIGIN, revisit)
    return ((geo.step(home, geo.cross), again, a),
            (geo.step(again, geo.cross), home, steps - 2 - a))


def build_lobes(geo, spec, pools, p, stats):
    """Every lobe that joins a half of the longer length to one of the shorter."""
    start, target, n = spec
    aim = geo.then(geo.invert(start), target)
    lobes = []
    for u in pools((n + 1) // 2).halves.values():
        u_claims, u_end = place(geo, u.letters, start)
        if clash(u_claims, p.cross_claims):
            continue
        key = geo.then(geo.invert(u.end), aim)
        for v in pools(n // 2).by_end.get(key, ()):
            lobe = join_halves(geo, u, u_claims, u_end, v, target, p, stats)
            if lobe:
                lobes.append(lobe)
    return lobes


def build_run_lobes(geo, spec, pools, p, stats, before=None):
    """Every lobe B that is a half, the run of straights, then a half: one per
    length of the half before the run, or only `before` when given."""
    start, target, n = spec
    aim = geo.then(geo.invert(start), target)
    free = n - p.run
    lobes = []
    for m in (range(free + 1) if before is None else (before,)):
        for u in pools(m).halves.values():
            u_claims, u_end = place(geo, u.letters, start)
            if clash(u_claims, p.cross_claims):
                continue
            run_claims, run_end = place(geo, p.run_letters, u_end)
            if clash(run_claims, p.cross_claims) or clash(run_claims, u_claims):
                continue
            key = geo.then(geo.invert(geo.then(u.end, p.run_motion)), aim)
            led = Claims(u_claims.solid | run_claims.solid, u_claims.wanted | run_claims.wanted)
            for v in pools(free - m).by_end.get(key, ()):
                lobe = join_halves(geo, u, led, run_end, v, target, p, stats, p.run_letters)
                if lobe:
                    lobes.append(lobe)
    return lobes


def join_halves(geo, u, u_claims, u_end, v, target, p, stats, between=()):
    stats["matches"] += 1
    counts = tuple(x + y for x, y in zip(u.counts, v.counts))
    if any(c > m for c, m in zip(counts, p.cap)):
        return None
    v_claims, end = place(geo, v.letters, u_end)
    if end != target:
        raise SystemExit("the motion arithmetic disagrees with the walk it predicted")
    if clash(v_claims, p.cross_claims) or clash(u_claims, v_claims):
        return None
    stats["lobes"] += 1
    merged = Claims(u_claims.solid | v_claims.solid, u_claims.wanted | v_claims.wanted)
    return Lobe(u.letters + tuple(between) + v.letters, counts, merged)


def join_lobes(geo, lobes_a, lobes_b, p, stats):
    """Pairs whose cubes add up to the inventory, less the cross, and do not collide."""
    by_counts = defaultdict(list)
    for lobe in lobes_b:
        by_counts[lobe.counts].append(lobe)
    for a in lobes_a:
        need = tuple(m - c for m, c in zip(p.cap, a.counts))
        for b in by_counts.get(need, ()):
            stats["pairs"] += 1
            if not clash(a.claims, b.claims):
                stats["tracks"] += 1
                yield (geo.cross, *a.letters, geo.cross, *b.letters), a.claims, b.claims


# ---- the question's frame -------------------------------------------------

def anchor(geo, route, material, box):
    """The first reading of the track that puts its start piece's cube at the origin,
    entered in DF, with nothing below it and everything within the box, or None.
    The walk's heads are the train's cells, so a piece read as the start lands
    its head on geo.home rather than on the origin."""
    lo = [min(c[a] for c in material) for a in range(3)]
    hi = [max(c[a] for c in material) for a in range(3)]
    if any(h - lo_ > 2 * box for lo_, h in zip(lo, hi)):
        return None
    state = (ORIGIN, geo.start)
    for i, t in enumerate(route):
        c, pose = state
        if all(fits_box(add(geo.unturn(pose, sub(m, c)), geo.home), box) for m in material):
            return route[i:] + route[:i]
        state = geo.step(state, t)
    return None


def fits_box(w, box):
    return w[1] >= 0 and abs(w[0]) <= box and w[1] <= box and abs(w[2]) <= box


def canon(shape):
    """The track a shape describes: its travel order is one cycle, so two shapes
    are one track exactly when one is a rotation of the other, and the rotations
    starting at a cross stand for all of them."""
    return min(shape[i:] + shape[:i] for i, ch in enumerate(shape) if ch == "X")


def mirror(shape):
    return shape.translate(str.maketrans("LR", "RL"))


# ---- output ---------------------------------------------------------------

class Checker:
    """check-route.js, kept running: a shape a line in, a report a line out. A spawn
    per shape cost ~0.17 s, which was most of a run's wall time."""

    def __init__(self):
        self.node = subprocess.Popen(["node", "scripts/check-route.js", "--any", "--stdin"],
                                     cwd=REPO, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     text=True)

    def report(self, shape):
        self.node.stdin.write(shape + "\n")
        self.node.stdin.flush()
        line = self.node.stdout.readline()
        if not line:
            raise SystemExit(f"check-route.js exited with {self.node.wait()}")
        return json.loads(line)


def verify(shape, p, checker):
    report = checker.report(shape)
    if not report["legal"]:
        raise SystemExit(f"VERIFICATION FAILED: {json.dumps(report)}")
    wrong = [name for name, ok in (
        ("spent", report["spent"] == p.inventory),
        ("revisits", report["revisits"] == 1),
        ("floor", report["onTheGround"]),
        ("box", report["box"] <= p.box),
        ("run", "S" * p.run in shape + shape),
    ) if not ok]
    if wrong:
        raise SystemExit(f"VERIFICATION FAILED ({', '.join(wrong)}): {json.dumps(report)}")
    return report


class Output:
    """Dedupe by track, verify through the JS, then print or record."""

    def __init__(self, p):
        self.p, self.started, self.written = p, time.time(), 0
        self.seen = {canon(r["shape"]) for r in read_records(p)}
        self.checker = Checker()

    def offer(self, geo, route, claims, meta):
        if canon("".join(geo.letter[t] for t in route)) in self.seen:
            return 0
        material = [unpack(k) for k in set().union(*(c.solid for c in claims))]
        anchored = anchor(geo, route, material, self.p.box)
        if anchored is None:
            return 0
        shape = "".join(geo.letter[t] for t in anchored)
        new = self.emit(shape, False, meta)
        if self.p.mirrors:
            new += self.emit(mirror(shape), True, meta)
        return new

    def emit(self, shape, mirrored, meta):
        if canon(shape) in self.seen:
            return 0
        self.seen.add(canon(shape))
        report = verify(shape, self.p, self.checker)
        self.written += 1
        if self.p.out is None:
            print(shape, flush=True)
            return 1
        append_record(self.p.out, {
            "shape": shape, "mirrored": mirrored, "score": self.p.score,
            "cubes": report["cubes"], "revisits": report["revisits"], "span": report["span"],
            "box": report["box"], "seconds": round(time.time() - self.started, 1),
            **meta, "config": self.p.config,
        })
        return 1


def read_records(p):
    if p.out is None or not p.out.exists():
        return []
    records = [json.loads(line) for line in p.out.read_text().splitlines() if line.strip()]
    if any(r["config"] != p.config for r in records):
        raise SystemExit(f"{p.out} was recorded for a different question — use a new --out")
    return records


def append_record(path, record):
    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")
        f.flush()


# ---- runs -----------------------------------------------------------------

def splits(p, parity):
    """Lengths of the shorter lobe worth trying. Drawing A no longer than B loses
    nothing, and --min-loop bounds it from below."""
    lo = 0 if p.min_loop is None else p.min_loop - 1
    most = p.steps - 2 - max(p.run, lo) if p.run else (p.steps - 2) // 2
    options = [a for a in range(lo, most + 1) if parity(a)]
    if not options:
        raise SystemExit("no lobe length satisfies --min-loop and parity")
    return options


def lobe_parity(geo, p):
    """A lobe's length has the parity of the distance it covers, since every piece
    moves the head an odd number of cells — so half the lengths cannot close."""
    spec_a, spec_b = lobe_specs(geo, p.steps, 0, geo.revisits[0])
    odd = [sum(map(abs, sub(s[1][0], s[0][0]))) % 2 for s in (spec_a, spec_b)]
    return lambda a: a % 2 == odd[0] and (p.steps - 2 - a) % 2 == odd[1]


def one_round(geo, p, a, revisit, pools, stats, before=None):
    """Every track with lobe A of length `a` and the given second pass, from these pools."""
    spec_a, spec_b = lobe_specs(geo, p.steps, a, revisit)
    lobes_a = build_lobes(geo, spec_a, pools, p, stats)
    if not lobes_a:
        lobes_b = []
    elif p.run:
        lobes_b = build_run_lobes(geo, spec_b, pools, p, stats, before)
    else:
        lobes_b = build_lobes(geo, spec_b, pools, p, stats)
    return join_lobes(geo, lobes_a, lobes_b, p, stats)


def run_exhaustive(geo, p):
    pools = all_pools(geo, max((p.steps - 1) // 2, p.steps - 2 - p.run if p.run else 0), p)
    out, stats = Output(p), defaultdict(int)
    stats["halves"] = sum(len(pool.halves) for pool in pools)
    lengths = splits(p, lambda _: True)
    for revisit, a in itertools.product(geo.revisits, lengths):
        for route, *claims in one_round(geo, p, a, revisit, pools.__getitem__, stats):
            stats["new"] += out.offer(geo, route, [*claims, p.cross_claims], {})
    print(f"exhaustive: {summary(stats)}", file=sys.stderr)


def run_sampled(geo, p):
    seed = p.seed if p.seed is not None else random.randrange(10**9)
    master, out = random.Random(seed), Output(p)
    parity = lobe_parity(geo, p)
    lengths = splits(p, parity)
    print(f"seed {seed}  lobe A lengths {lengths}  {p.halves} halves a length a round"
          f"  (--seed {seed} reproduces this run)", flush=True)
    rounds = itertools.count(1) if p.rounds == 0 else range(1, p.rounds + 1)
    try:
        for n in rounds:
            sample_round(geo, p, n, master.randrange(10**9), lengths, out)
    except KeyboardInterrupt:
        print("\nstopped")
    print(f"{out.written} layout(s) in {time.time() - out.started:.0f}s")


def sample_round(geo, p, n, seed, lengths, out):
    rng, stats, started = random.Random(seed), defaultdict(int), time.time()
    a, revisit = rng.choice(lengths), rng.choice(geo.revisits)
    before = rng.randrange(p.steps - 2 - a - p.run + 1) if p.run else None
    cache = {}

    def pools(length):
        if length not in cache:
            cache[length] = sample_pool(geo, length, p, rng, stats)
        return cache[length]

    meta = {"round": n, "seed": seed, "loops": [a + 1, p.steps - 1 - a]}
    for route, *claims in one_round(geo, p, a, revisit, pools, stats, before):
        stats["new"] += out.offer(geo, route, [*claims, p.cross_claims], meta)
    split = f" before run {before:2d}" if p.run else ""
    print(f"  round {n}  a={a:2d} {geo.poses[revisit]}{split}  {time.time() - started:6.1f}s  "
          f"{summary(stats)}", flush=True)


def summary(stats):
    return (f"halves {stats['halves']} (dead {stats['dead']})  "
            f"lobes {stats['lobes']}/{stats['matches']} matches  "
            f"tracks {stats['tracks']}/{stats['pairs']} pairs  new {stats['new']}")


# ---- flags ----------------------------------------------------------------

def check_flags(ap, a, geo):
    """Refusals, as a table: one entry per combination that would answer a
    different question than the one asked."""
    unknown = sorted(set(a.inventory) - set(geo.types))
    refusals = [
        (unknown, f"unknown piece type(s) in --set: {', '.join(unknown)}"),
        (a.inventory.get("cross") != 1,
         "the route is read as X·A·X·B around one crossed cross, so --set must hold exactly one"),
        (a.exhaustive and any(v is not None for v in (a.rounds, a.halves, a.seed, a.out)),
         "--exhaustive enumerates everything once and prints it: no --rounds, --halves, "
         "--seed or --out"),
        (a.halves is not None and a.halves < 1, "--halves must be at least 1"),
        (a.run < 0 or a.run > a.inventory.get("straight", 0),
         "--run must be between 0 and the straights in --set"),
    ]
    for refused, reason in refusals:
        if refused:
            ap.error(reason)


def parse_args(geo):
    ap = argparse.ArgumentParser(description="Crossed layouts by meeting in the middle.")
    ap.add_argument("--set", dest="set_json", required=True, help="inventory as JSON")
    ap.add_argument("--box", type=int, default=8)
    ap.add_argument("--halves", type=int, default=None,
                    help=f"walks sampled per half-length per round (default {DEFAULT_HALVES})")
    ap.add_argument("--rounds", type=int, default=None, help="0 = until stopped (default 1)")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--min-loop", type=int, default=None,
                    help="the smaller of the crossing's two loops, in steps, at least this")
    ap.add_argument("--out", type=Path, default=None, help="append verified layouts here")
    ap.add_argument("--run", type=int, default=0,
                    help="only tracks with at least this many straights in a row")
    ap.add_argument("--exhaustive", action="store_true",
                    help="every half and every split, printed — for checking against the oracle")
    a = ap.parse_args()
    a.inventory = json.loads(a.set_json)
    check_flags(ap, a, geo)
    return settle(geo, a)


def settle(geo, a):
    """Everything derived from the flags, computed once."""
    a.inventory = {t: a.inventory.get(t, 0) for t in geo.types}
    a.halves = DEFAULT_HALVES if a.halves is None else a.halves
    a.rounds = 1 if a.rounds is None else a.rounds
    a.steps = sum(a.inventory.values()) + 1
    a.cap = [0 if t == geo.cross else a.inventory[name] for t, name in enumerate(geo.types)]
    straight = geo.types.index("straight")
    # The run's straights are spent before any half is grown.
    a.cap[straight] -= a.run
    a.run_letters = (straight,) * a.run
    a.run_motion = place(geo, a.run_letters, (ORIGIN, geo.start))[1]
    a.kinds = [t for t, n in enumerate(a.cap) if n]
    a.reach = 2 * a.box
    # A mirror is free output when sampling, and sound only with equal left and right
    # curves. Exhaustive runs go without, so the oracle test sees both headings found.
    a.mirrors = not a.exhaustive and a.inventory["leftCurve"] == a.inventory["rightCurve"]
    a.score = sum(geo.score[t] * a.inventory[name] for t, name in enumerate(geo.types))
    a.cross_claims = place(geo, (geo.cross,), (ORIGIN, geo.start))[0]
    a.config = {"inventory": a.inventory, "steps": a.steps, "box": a.box, "minY": 0,
                "startPose": START, "minLoopLength": a.min_loop,
                # A run asks a narrower question; without one the config is as it was.
                **({"run": a.run} if a.run else {})}
    return a


def main():
    geo = load_geometry()
    p = parse_args(geo)
    (run_exhaustive if p.exhaustive else run_sampled)(geo, p)


if __name__ == "__main__":
    main()
