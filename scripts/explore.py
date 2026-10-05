# /// script
# requires-python = ">=3.11"
# dependencies = ["ortools"]
# ///
"""The track model on native OR-Tools, for exploration.

    uv run scripts/explore.py
    uv run scripts/explore.py --set '{"leftCurve":4}' --time 10
    uv run scripts/explore.py --hint LIRIROSOLORLLSORII
    uv run scripts/explore.py --random --rounds 5
    uv run scripts/explore.py --random --rounds 0 --time 5 --out sweep.jsonl
    uv run scripts/explore.py --random --rounds 0 --time 5 --out sweep.jsonl --resume
    uv run scripts/explore.py --set '{...}' --objective volume --symmetry --hint ...

Native CP-SAT threads are worth 5-10x over the browser WASM build, so this is
the place to try inventories, boxes and objectives quickly. It is the core
optimiser only: no crossings encoding, no cross piece, no allSolutions loop —
src/solver/index.js remains the model of record and the two are kept diffable
function by function.

Every piece in the inventory must be used: the loop length is always
sum(inventory.values()) and there is no partial-spend mode. That makes this a
satisfiability model by default, not an optimisation one — once the whole
inventory is spent every arrangement ties on score (see "SCORES is inert" in
CLAUDE.md), so there is no `model.maximize`; the score is computed
arithmetically from the inventory for reporting only. This is a deliberate
divergence from src/solver/index.js, which still allows dropping pieces — see
the `explore.py` section of CLAUDE.md.

`--random` is the one mode that does post an objective, and it exists because
of that tie: a random weight per (step, piece type) is a term that reads the
arrangement, so it picks one full-spend loop out of the many rather than
changing which loops are legal. It costs the speed the satisfiability model was
built for, since there is now an optimum to prove.

`--objective` is the other: one of the six metrics of src/metrics.js, in its
good direction, or their combination weighted for `--ranges`. Those read the
arrangement too, so they are real questions under full spend. The answer is
recounted by check-route.js, and a recount that disagrees with the solver's own
objective value is an encoding bug and exits nonzero.

A previous Python model was deleted for being a hand-ported duplicate nothing
kept in step with src/track.js. This one avoids that by construction: geometry
comes from `node scripts/export-geometry.js` on every run (never re-derived
here), and every answer is verified by `node scripts/check-route.js <shape>
--any` — the tested JS chains it, this side never trusts its own solver.

One porting note: the JS `differ` helper (a reified pair of inequalities)
exists only because cpsat-js's notEquals is a silent no-op. Here clearance is
the real thing, `model.add(m != t)`.
"""

import argparse
import itertools
import json
import random
import subprocess
from pathlib import Path

from ortools.sat.python import cp_model

REPO = Path(__file__).resolve().parent.parent
MAX_FOOT = 4  # the most cells any piece's material fills
WEIGHT_SPREAD = 1000  # --random draws each weight from 0..this, exclusive


def run_node(script, *args):
    done = subprocess.run(["node", script, *args], cwd=REPO, capture_output=True, text=True)
    if done.returncode != 0:
        raise SystemExit(f"{script} failed:\n{done.stderr}")
    return done.stdout


def load_geometry():
    return json.loads(run_node("scripts/export-geometry.js"))


def filter_rows(geo, exclude):
    unknown = [t for t in exclude if t not in geo["pieceTypes"]]
    if unknown:
        raise SystemExit(f"unknown piece type(s) in --exclude: {', '.join(unknown)}")
    return [r for r in geo["transitions"] if geo["pieceTypes"][r["type"]] not in exclude]


def cells_of(geo, row, kind):
    return geo["cells"][kind][row["pose"]][row["type"]]


def pick(sels, rows, of):
    """Sum of coefficient x selector — the value some quantity takes at this step."""
    return sum(v * c for v, c in zip(sels, map(of, rows)) if c)


def add_transitions(model, rows, selectors, x, y, z, pose):
    for i, sels in enumerate(selectors):
        # Zero sum = no move, so the displacement needs no enforcement literal.
        model.add(x[i + 1] == x[i] + pick(sels, rows, lambda r: r["dx"]))
        model.add(y[i + 1] == y[i] + pick(sels, rows, lambda r: r["dy"]))
        model.add(z[i + 1] == z[i] + pick(sels, rows, lambda r: r["dz"]))
        model.add(pose[i] == pick(sels, rows, lambda r: r["pose"]))
        model.add(pose[i + 1] == pick(sels, rows, lambda r: r["nextPose"]))


def bound_material(model, geo, rows, selectors, x, y, z, box, min_y):
    """The box and the floor bind material cells; the floor binds the head in its domain.

    Returns every material slot as (used, coord), for anything else that reads
    where the material is — the volume objective.
    """
    material = []
    for i, sels in enumerate(selectors):
        for k in range(MAX_FOOT):
            def cell_at(row, k=k):
                cells = cells_of(geo, row, "material")
                return cells[k] if k < len(cells) else None

            used = model.new_bool_var(f"inBox_{i}_{k}")
            model.add(used == pick(sels, rows, lambda r: 1 if cell_at(r) else 0))
            coord = [axis[i] + pick(sels, rows, lambda r, a=a: (cell_at(r) or (0, 0, 0))[a])
                     for a, axis in enumerate((x, y, z))]
            for a, at in enumerate(coord):
                model.add(at <= box).only_enforce_if(used)
                floor = min_y if a == 1 and min_y is not None else -box
                model.add(at >= floor).only_enforce_if(used)
            material.append((used, coord))
    return material


def grid(box):
    # Heads and train cells live within box + 1, and the span keeps a cell of
    # room past that; undersize it and two distinct cells fold onto the same id.
    span = box + 2
    n = 2 * span + 1
    return {"n": n, "size": n**3, "shift": span * (1 + n + n * n)}


def claim_slots(model, geo, rows, selectors, x, y, z, g, kind, sentinel):
    """One integer per cell a piece claims; unused slots park on a sentinel."""
    claims = []
    max_slots = max(len(cells_of(geo, r, kind)) for r in rows)
    for i, sels in enumerate(selectors):
        head = x[i] + y[i] * g["n"] + z[i] * g["n"] * g["n"] + g["shift"]
        for k in range(max_slots):
            def cell_at(row, k=k):
                cells = cells_of(geo, row, kind)
                return cells[k] if k < len(cells) else None

            def id_of(c, n=g["n"]):
                return c[0] + c[1] * n + c[2] * n * n

            used = model.new_bool_var(f"{kind}Used_{i}_{k}")
            model.add(used == pick(sels, rows, lambda r: 1 if cell_at(r) else 0))
            spare = sentinel + i * MAX_FOOT + k
            claim = model.new_int_var(0, spare, f"{kind}_{i}_{k}")
            offset = pick(sels, rows, lambda r: id_of(cell_at(r)) if cell_at(r) else 0)
            model.add(claim == head + offset).only_enforce_if(used)
            model.add(claim == spare).only_enforce_if(~used)
            claims.append(claim)
    return claims


def add_collisions(model, geo, rows, selectors, x, y, z, box, steps, check_train):
    g = grid(box)
    slots = lambda kind, sentinel: claim_slots(
        model, geo, rows, selectors, x, y, z, g, kind, sentinel)
    material = slots("material", g["size"])
    model.add_all_different(material)
    if check_train:
        train = slots("train", g["size"] + steps * MAX_FOOT)
        # Train cells may coincide with each other — there is only one train —
        # so this is pairwise material vs train, not an AllDifferent.
        for m in material:
            for t in train:
                model.add(m != t)


def add_inventory(model, geo, rows, selectors, inventory):
    for pool in geo["pieceTypes"]:
        in_pool = [v for sels in selectors for v, r in zip(sels, rows)
                   if geo["pieceTypes"][r["type"]] == pool]
        if in_pool:
            model.add(sum(in_pool) == inventory.get(pool, 0))


def break_mirror_symmetry(model, geo, rows, selectors):
    """A right curve only after a left one has already appeared (strictly earlier step)."""
    of_type = lambda sels, name: [v for v, r in zip(sels, rows)
                                  if geo["pieceTypes"][r["type"]] == name]
    lefts_so_far = []
    for sels in selectors:
        for right in of_type(sels, "rightCurve"):
            model.add_bool_or([~right, *lefts_so_far])
        lefts_so_far += of_type(sels, "leftCurve")


def handed(shape, symmetry):
    """The mirror break allows a right curve only after a left one, so a hint that
    meets a right curve first is asked for as its mirror — the same rule as
    sweep-crossings.js."""
    if not symmetry or "R" not in shape:
        return shape
    if "L" in shape and shape.index("L") < shape.index("R"):
        return shape
    return shape.translate(str.maketrans("LR", "RL"))


def hint_route(model, geo, rows, selectors, route, start_pose):
    """Walk the route through the transition table and hint the true selectors."""
    if len(route) != len(selectors):
        raise SystemExit(f"hint is {len(route)} pieces but there are {len(selectors)} steps — "
                         "every piece is used now, so the hint must be full-length")
    p = geo["poses"].index(start_pose)
    home = geo["startCells"][p]
    cell = list(home)
    for i, piece in enumerate(route):
        r = next((r for r, row in enumerate(rows)
                  if row["pose"] == p and geo["pieceTypes"][row["type"]] == piece), None)
        if r is None:
            raise SystemExit(f"hint step {i} is a {piece} at {geo['poses'][p]}, "
                             "which this model has no row for — is that type excluded?")
        model.add_hint(selectors[i][r], 1)
        row = rows[r]
        cell = [cell[0] + row["dx"], cell[1] + row["dy"], cell[2] + row["dz"]]
        p = row["nextPose"]
    if p != geo["poses"].index(start_pose) or cell != home:
        raise SystemExit("hint route does not close back to where it started")


def build_model(geo, rows, p):
    model = cp_model.CpModel()
    start = geo["poses"].index(p.start_pose)
    steps, box, min_y = p.steps, p.box, p.min_y

    # Head position and pose before each step, plus one more for after the last.
    # The head's own domain is one wider than the box, because the box binds
    # material cells and a head is the train's cell, one beyond its cube — except
    # below the floor, where the train cannot be either. No piece books a train
    # cell lower than both of its heads, so bounding the heads bounds the train.
    reach = box + 1
    x = [model.new_int_var(-reach, reach, f"x_{i}") for i in range(steps + 1)]
    y = [model.new_int_var(-reach if min_y is None else min_y, reach, f"y_{i}")
         for i in range(steps + 1)]
    z = [model.new_int_var(-reach, reach, f"z_{i}") for i in range(steps + 1)]
    pose = [model.new_int_var(0, len(geo["poses"]) - 1, f"pose_{i}") for i in range(steps + 1)]

    selectors = []
    for i in range(steps):
        sels = [model.new_bool_var(f"sel_{i}_{r}") for r in range(len(rows))]
        model.add_exactly_one(sels)
        selectors.append(sels)

    add_transitions(model, rows, selectors, x, y, z, pose)

    # The loop closes on cell AND pose, at both ends: the train's cell over the
    # start cube, which is the origin.
    hx, hy, hz = geo["startCells"][start]
    for v, want in [(x[0], hx), (y[0], hy), (z[0], hz), (pose[0], start),
                    (x[steps], hx), (y[steps], hy), (z[steps], hz), (pose[steps], start)]:
        model.add(v == want)

    material = bound_material(model, geo, rows, selectors, x, y, z, box, min_y)
    if p.collisions:
        add_collisions(model, geo, rows, selectors, x, y, z, box, steps, p.check_train)
    add_inventory(model, geo, rows, selectors, p.inventory)
    if p.symmetry:
        break_mirror_symmetry(model, geo, rows, selectors)

    if p.objective:
        add_objective(model, geo, rows, selectors, material, y, p)
    if p.hint:
        hint_route(model, geo, rows, selectors, p.hint, p.start_pose)
    return model, selectors


UP = 1


def rows_where(selectors, rows, test):
    """The selectors, across all steps, whose row passes a test."""
    return [v for sels in selectors for v, r in zip(sels, rows) if test(r)]


def faces_term(model, geo, rows, selectors, material, y, p):
    """A face is seen only if some step is entered riding on it: sound only when maximised."""
    seen = []
    for f in dict.fromkeys(pose[0] for pose in geo["poses"]):
        s = model.new_bool_var(f"seen_{f}")
        model.add(s <= sum(rows_where(selectors, rows, lambda r, f=f: geo["poses"][r["pose"]][0] == f)))
        seen.append(s)
    return sum(seen)


def volume_term(model, geo, rows, selectors, material, y, p):
    """The material's bounding box, as bounds every material cell sits inside.

    Nothing pulls the bounds in but the objective: sound only when minimised.
    Native CP-SAT multiplies, so the span triple table the JS needs is not here.
    """
    floors = [-p.box, -p.box if p.min_y is None else p.min_y, -p.box]
    spans = []
    for a, floor in enumerate(floors):
        hi = model.new_int_var(floor, p.box, f"hi_{a}")
        lo = model.new_int_var(floor, p.box, f"lo_{a}")
        for used, coord in material:
            model.add(hi >= coord[a]).only_enforce_if(used)
            model.add(lo <= coord[a]).only_enforce_if(used)
        span = model.new_int_var(1, p.box - floor + 1, f"span_{a}")
        model.add(span == hi - lo + 1)
        spans.append(span)
    most = (2 * p.box + 1) ** 2 * (p.box - floors[1] + 1)
    volume = model.new_int_var(1, most, "volume")
    model.add_multiplication_equality(volume, spans)
    return volume


# The longest run of each curve a closed track can hold. Four of a curve close a
# ring and every piece after one collides; three inside or outside curves have
# been found in no closed track but the IIII ring. src/solver/index.js has the
# evidence. Wrapping, which full spend makes sound; a four-step loop is exempt.
RUN_CAPS = [("leftCurve", 3), ("rightCurve", 3), ("insideCurve", 2), ("outsideCurve", 2)]


def cap_runs(model, geo, selectors, type_is, at):
    if len(selectors) <= 4:
        return
    for name, most in RUN_CAPS:
        t = geo["pieceTypes"].index(name)
        for i in range(len(selectors)):
            model.add(sum(type_is(at(i + k), t) for k in range(most + 1)) <= most)


def repeats_term(model, geo, rows, selectors, material, y, p):
    """Steps that start three of a kind in a row, wrapping.

    One `trip` per step and type, true exactly when that type fills all three:
    forced on by the triple and off by any one of them missing, so sound in both
    directions.
    """
    types = {r["type"] for r in rows}

    def type_is(sels, t):
        return sum(v for v, r in zip(sels, rows) if r["type"] == t)

    def at(i):
        return selectors[i % len(selectors)]

    cap_runs(model, geo, selectors, type_is, at)
    trips = []
    for i, sels in enumerate(selectors):
        for t in types:
            run = [type_is(s, t) for s in (sels, at(i + 1), at(i + 2))]
            trip = model.new_bool_var(f"trip_{i}_{t}")
            model.add(trip >= sum(run) - 2)
            for one in run:
                model.add(trip <= one)
            trips.append(trip)
    return sum(trips)


def face_up_term(model, geo, rows, selectors, material, y, p):
    """Steps entered riding face up: the floor faces down."""
    return sum(rows_where(selectors, rows,
                          lambda r: geo["proj"][geo["poses"][r["pose"]][0]][UP] < 0))


def ceiling_term(model, geo, rows, selectors, material, y, p):
    """Steps entered riding upside down: the floor faces up."""
    return sum(rows_where(selectors, rows,
                          lambda r: geo["proj"][geo["poses"][r["pose"]][0]][UP] > 0))


def height_term(model, geo, rows, selectors, material, y, p):
    """The train's up coordinate summed over the steps: the head before each one."""
    return sum(y[:len(selectors)])


METRIC_TERMS = {"faces": faces_term, "volume": volume_term, "repeats": repeats_term,
                "faceUp": face_up_term, "ceiling": ceiling_term, "height": height_term}


def add_objective(model, geo, rows, selectors, material, y, p):
    """One metric in its good direction, or the combination in exact integers."""

    def term(name):
        return METRIC_TERMS[name](model, geo, rows, selectors, material, y, p)

    if p.objective == "combined":
        weights = geo["combined"][p.ranges]["weights"]
        model.maximize(sum(w * term(name) for name, w in weights.items() if w))
    elif geo["signs"][p.objective] > 0:
        model.maximize(term(p.objective))
    else:
        model.minimize(term(p.objective))


def recount_objective(geo, p, metrics):
    """What the objective should have read, from check-route.js's recount."""
    if p.objective == "combined":
        weights = geo["combined"][p.ranges]["weights"]
        return sum(w * metrics[name] for name, w in weights.items())
    return metrics[p.objective]


def add_random_objective(model, geo, rows, selectors, rng):
    """A random weight per (step, piece type), maximised.

    The one thing that can tell two full-spend loops apart. Score cannot: every
    arrangement of the whole inventory sums to the same SCORES total, so the
    real objective is a constant here (CLAUDE.md, "SCORES is inert"). Weighting
    a piece by *where in the lineup it sits* does read the arrangement, so each
    seed pulls the search towards a different layout.

    One draw per (step, type), not per (step, row): rows are type x entry pose,
    and weighting the pose too would be a bias about orientation rather than
    about order.
    """
    terms = []
    for sels in selectors:
        weights = {t: rng.randrange(WEIGHT_SPREAD) for t in geo["pieceTypes"]}
        terms += [weights[geo["pieceTypes"][r["type"]]] * v for v, r in zip(sels, rows)]
    model.maximize(sum(terms))


def read_route(value_of, geo, rows, selectors):
    route = []
    for sels in selectors:
        chosen = [r for r, v in enumerate(sels) if value_of(v)]
        if chosen:
            route.append(geo["pieceTypes"][rows[chosen[0]]["type"]])
    return route


class Incumbent(cp_model.CpSolverSolutionCallback):
    """Prints each solution found. Watch-only: never touches the model."""

    def __init__(self, geo, rows, selectors, held):
        super().__init__()
        self.geo, self.rows, self.selectors, self.held = geo, rows, selectors, held

    def on_solution_callback(self):
        route = read_route(self.value, self.geo, self.rows, self.selectors)
        score = sum(self.geo["scores"][t] for t in route)
        shape = "".join(self.geo["letters"][t] for t in route)
        print(f"  {self.wall_time:6.1f}s  {score:3d} pts  {len(route)}/{self.held} cubes  {shape}",
              flush=True)


class AllSolutions(cp_model.CpSolverSolutionCallback):
    """Collects distinct full-spend solutions, stopping once `limit` are found."""

    def __init__(self, geo, rows, selectors, held, limit):
        super().__init__()
        self.geo, self.rows, self.selectors, self.held = geo, rows, selectors, held
        self.limit, self.results = limit, []

    def on_solution_callback(self):
        route = read_route(self.value, self.geo, self.rows, self.selectors)
        score = sum(self.geo["scores"][t] for t in route)
        shape = "".join(self.geo["letters"][t] for t in route)
        self.results.append((shape, score, self.wall_time))
        print(f"  {self.wall_time:6.1f}s  {score:3d} pts  {len(route)}/{self.held} cubes  "
              f"[{len(self.results)}/{self.limit}]  {shape}", flush=True)
        if len(self.results) >= self.limit:
            self.stop_search()


def verify(shape):
    report = json.loads(run_node("scripts/check-route.js", shape, "--any"))
    if not report.get("legal"):
        raise SystemExit(f"VERIFICATION FAILED: {json.dumps(report)}")
    return report


def verify_full(shape, held):
    report = verify(shape)
    if report["cubes"] != held:
        raise SystemExit(f"VERIFICATION FAILED for {shape}: chainTrack counts "
                         f"{report['cubes']} cubes, expected {held}")
    return report


def solve_round(geo, rows, p, held, seed):
    """One randomised solve: fresh weights, fresh model, verified answer."""
    model, selectors = build_model(geo, rows, p)
    add_random_objective(model, geo, rows, selectors, random.Random(seed))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.time
    solver.parameters.num_search_workers = p.workers
    status = solver.solve(model)

    name = solver.status_name(status).lower()
    if status == cp_model.INFEASIBLE:
        raise SystemExit(f"INFEASIBLE after {solver.wall_time:.1f}s — "
                         "this inventory cannot be fully spent in this box")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # UNKNOWN: nothing found inside --time. That is a fact about the clock,
        # not about the inventory, so it is a missed round rather than an answer
        # — and emphatically not the INFEASIBLE above, which is proof.
        return None, solver.wall_time, name
    route = read_route(lambda v: solver.value(v) == 1, geo, rows, selectors)
    shape = "".join(geo["letters"][t] for t in route)
    if len(route) != held:
        raise SystemExit(f"expected {held} cubes, solver returned {len(route)}")
    return shape, solver.wall_time, name


def explore_all_solutions(geo, rows, p, held):
    """Enumerate distinct full-spend solutions from one search."""
    model, selectors = build_model(geo, rows, p)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.time
    # Enumerating all solutions hangs under the portfolio search multiple
    # workers use — verified directly against a trivial model — so this
    # mode is single-worker regardless of --workers.
    print("--all-solutions forces num_search_workers=1 (no 8-worker speedup here)")
    solver.parameters.num_search_workers = 1
    solver.parameters.enumerate_all_solutions = True
    cb = AllSolutions(geo, rows, selectors, held, p.all_solutions)
    status = solver.solve(model, cb)

    if not cb.results:
        raise SystemExit(f"{solver.status_name(status)} after {solver.wall_time:.1f}s — "
                         "found no full-spend solutions in this box")

    print(f"found {len(cb.results)} distinct solution(s) in {solver.wall_time:.1f}s")
    for shape, _, _ in cb.results:
        if not p.no_verify:
            verify_full(shape, held)
        print(shape)


def run_config(p):
    """What a resumed run has to match. Mixing boxes or inventories in one file
    would put incomparable layouts side by side, so resume refuses on any change."""
    return {"inventory": p.inventory, "box": p.box, "minY": p.min_y,
            "exclude": sorted(p.exclude), "startPose": p.start_pose}


def read_records(path, config):
    """Load an interrupted run. Every line is one verified layout, so a killed
    round simply is not there and the file needs no repair."""
    if not path.exists():
        return []
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    drifted = next((r for r in records if r["config"] != config), None)
    if drifted:
        raise SystemExit(f"{path} was written for a different question:\n"
                         f"  recorded: {json.dumps(drifted['config'], sort_keys=True)}\n"
                         f"  asked:    {json.dumps(config, sort_keys=True)}\n"
                         "resume needs the same inventory, box, floor, exclusions and "
                         "start pose — use a new --out file")
    return records


def append_record(path, record):
    """One line per layout, flushed. A kill between rounds loses nothing recorded."""
    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")
        f.flush()


def round_numbers(done, rounds):
    """Rounds still to do. --rounds is a total for the file, not an increment, so
    resuming finishes the job rather than doubling it; 0 means keep going."""
    if rounds == 0:
        return itertools.count(done + 1)
    return range(done + 1, rounds + 1)


def explore_random(geo, rows, p, held):
    """Re-solve with fresh random weights per round, so each answer differs.

    Every round is appended to --out before the next one starts, and the seed
    stream is replayed from the master seed on resume, so an interrupted sweep
    picks up exactly where it stopped instead of re-treading ground.
    """
    config = run_config(p)
    done = read_records(p.out, config) if p.resume else []
    seed = done[0]["master"] if done else (
        p.seed if p.seed is not None else random.randrange(10**9))
    total = "unbounded" if p.rounds == 0 else p.rounds
    print(f"random objective  seed {seed}  {total} round(s)  {p.time}s each"
          f"  (--seed {seed} reproduces this run)")
    if done:
        print(f"resuming {p.out}: {len(done)} round(s) already recorded, "
              f"{len({r['shape'] for r in done if r['shape']})} distinct")

    master = random.Random(seed)
    for _ in done:  # advance the stream past what is already on disk
        master.randrange(10**9)

    score = sum(geo["scores"][t] * n for t, n in p.inventory.items())
    shapes = [r["shape"] for r in done if r["shape"]]
    rounds = len(done)
    try:
        for n in round_numbers(len(done), p.rounds):
            rounds = n
            round_seed = master.randrange(10**9)
            shape, secs, name = solve_round(geo, rows, p, held, round_seed)
            report = verify_full(shape, held) if shape and not p.no_verify else None
            note = ("miss " if not shape
                    else "seen " if shape in shapes
                    else "new  ")
            if shape:
                shapes.append(shape)
            print(f"  round {n}/{total}  {secs:6.1f}s  {name:8s}  {note}"
                  f"{score:3d} pts  {held} cubes  {shape or '(nothing in time)'}"
                  f"{'  span ' + report['span'] if report else ''}", flush=True)
            if p.out:
                # Misses are recorded too, shape null. They have to be: resume
                # replays the seed stream by counting lines, so a dropped round
                # would slide every later round onto the wrong weights.
                append_record(p.out, {
                    "master": seed, "seed": round_seed, "round": n, "shape": shape,
                    "score": score if shape else None, "cubes": held,
                    "seconds": round(secs, 1), "status": name,
                    "span": report["span"] if report else None, "config": config,
                })
    except KeyboardInterrupt:
        print("\nstopped")

    misses = rounds - len(shapes)
    print(f"{len(set(shapes))} distinct layout(s) from {rounds} round(s), all {score} pts"
          f"{f' ({misses} found nothing in {p.time}s)' if misses else ''}")
    if p.out:
        print(f"recorded in {p.out} — re-run with --resume to carry on")


def check_flags(ap, a):
    """Reject combinations that would quietly answer a different question.

    A table rather than a stack of ifs: every entry is one refusal and one
    reason, and adding a flag does not deepen this function.
    """
    refusals = [
        (a.inventory.get("cross", 0) > 0 and "cross" in a.exclude,
         "the inventory holds crosses but this script has no crossing encoding"),
        (a.symmetry and a.inventory.get("leftCurve", 0) != a.inventory.get("rightCurve", 0),
         "--symmetry is only sound with equal left and right curve counts"),
        (a.random and a.all_solutions,
         "--random and --all-solutions are two different ways to get more than one "
         "layout; pick one"),
        (a.rounds != 1 and not a.random,
         "--rounds only means something with --random: without new weights every round "
         "solves the identical model"),
        (a.symmetry and a.random,
         "--symmetry fixes which handedness comes first, so it cuts away exactly the "
         "mirrored layouts --random is there to find"),
        (a.objective and a.random,
         "--objective and --random are two objectives; pick one"),
        (a.objective and a.all_solutions,
         "--all-solutions enumerates without an objective"),
        ((a.out or a.resume) and not a.random,
         "--out and --resume record a stream of randomised solves, so they need --random"),
        (a.resume and not a.out, "--resume needs the --out file it is resuming"),
        (a.resume and a.seed is not None,
         "--resume takes the master seed from the file; passing --seed too would silently "
         "restart the stream and re-tread rounds already recorded"),
        (a.rounds < 0, "--rounds cannot be negative (0 means keep going until stopped)"),
        (a.no_verify and a.out,
         "--out records layouts as verified; --no-verify would write unchecked ones"),
    ]
    for bad, message in refusals:
        if bad:
            ap.error(message)


def parse_args(geo):
    ap = argparse.ArgumentParser(description="Explore the track model on native OR-Tools.")
    ap.add_argument("--box", type=int, default=6)
    ap.add_argument("--miny", type=int, default=0, help="floor; 0 = nothing below ground")
    ap.add_argument("--no-floor", action="store_true", help="unset the floor (minY = null)")
    ap.add_argument("--exclude", default="cross", help="comma-separated piece types")
    ap.add_argument("--start-pose", default="DF")
    ap.add_argument("--set", dest="set_json", help="inventory as JSON (default: the 18-cube SET)")
    ap.add_argument("--hint", help="shape string to start the search from")
    ap.add_argument("--time", type=float, default=180, help="max solve seconds")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--all-solutions", type=int, default=None,
                     help="enumerate up to N distinct full-spend solutions instead of "
                          "stopping at the first (forces single-worker solving)")
    ap.add_argument("--random", action="store_true",
                    help="maximise a random weight per (step, piece type), so each run "
                         "lands on a different arrangement of the same full inventory")
    ap.add_argument("--seed", type=int, default=None,
                    help="seed for --random; omitted means a fresh one, always printed")
    ap.add_argument("--rounds", type=int, default=1,
                    help="how many randomised solves to run in total, each with new "
                         "weights; 0 keeps going until you stop it")
    ap.add_argument("--out", type=Path, default=None,
                    help="append each verified layout to this JSON Lines file")
    ap.add_argument("--resume", action="store_true",
                    help="carry on the run recorded in --out, skipping rounds already done")
    ap.add_argument("--objective", choices=[*geo["signs"], "combined"], default=None,
                    help="optimise one metric of src/metrics.js in its good direction, "
                         "or their equal-weighted combination")
    ap.add_argument("--ranges", choices=list(geo["combined"]), default="sweep28",
                    help="which population's ranges --objective combined rescales by")
    ap.add_argument("--symmetry", action="store_true", help="mirror break (needs equal L/R curve counts)")
    ap.add_argument("--no-collisions", action="store_true")
    ap.add_argument("--no-train", action="store_true", help="skip material-vs-train clearance")
    ap.add_argument("--no-verify", action="store_true")
    a = ap.parse_args()

    if a.start_pose not in geo["poses"]:
        ap.error(f"unknown pose {a.start_pose}")
    a.min_y = None if a.no_floor else a.miny
    a.inventory = json.loads(a.set_json) if a.set_json else geo["set"]
    a.steps = sum(a.inventory.values())
    a.collisions, a.check_train = not a.no_collisions, not a.no_train
    a.exclude = [t for t in a.exclude.split(",") if t]
    check_flags(ap, a)
    letters_to_type = {l: t for t, l in geo["letters"].items()}
    a.hint = [letters_to_type[l] for l in handed(a.hint, a.symmetry)] if a.hint else None
    return a


def main():
    geo = load_geometry()
    p = parse_args(geo)
    rows = filter_rows(geo, p.exclude)
    held = sum(p.inventory.values())
    print(f"steps={p.steps} (every piece used)  box {p.box}  floor {p.min_y}  workers {p.workers}"
          f"  inventory {p.inventory}")

    if p.random:
        explore_random(geo, rows, p, held)
        return
    if p.all_solutions:
        explore_all_solutions(geo, rows, p, held)
        return

    model, selectors = build_model(geo, rows, p)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.time
    solver.parameters.num_search_workers = p.workers
    status = solver.solve(model, Incumbent(geo, rows, selectors, held))

    name = solver.status_name(status)
    if status == cp_model.INFEASIBLE:
        raise SystemExit(f"{name} after {solver.wall_time:.1f}s — "
                         "this inventory cannot be fully spent in this box")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Only INFEASIBLE is proof. UNKNOWN means the clock ran out, which says
        # nothing about whether the inventory can be spent — raise --time.
        raise SystemExit(f"{name} after {solver.wall_time:.1f}s — nothing found in the "
                         "time given; this is not a verdict on the inventory, try --time")

    route = read_route(lambda v: solver.value(v) == 1, geo, rows, selectors)
    score = sum(geo["scores"][t] for t in route)
    shape = "".join(geo["letters"][t] for t in route)
    if p.objective:
        value, bound = solver.objective_value, solver.best_objective_bound
        gap = abs(bound - value) / max(abs(value), 1)
        print(f"{name.lower()} in {solver.wall_time:.1f}s: {p.objective} {value:g}, "
              f"bound {bound:g}, gap {100 * gap:.2f}%")
    else:
        print(f"feasible in {solver.wall_time:.1f}s: {score} pts, {len(route)}/{held} cubes "
              "(satisfiability only — no objective, every full-inventory loop ties on score)")
    print(f"  {shape}")

    if not p.no_verify:
        report = verify(shape)
        if report["cubes"] != len(route):
            raise SystemExit(f"VERIFICATION FAILED: chainTrack counts {report['cubes']} cubes, "
                             f"the solver claims {len(route)}")
        print(f"verified legal: {report['cubes']} cubes, span {report['span']}, "
              f"{'on the ground' if report['onTheGround'] else 'below ground'}")
        if p.objective:
            recount = recount_objective(geo, p, report["metrics"])
            print(f"recounted: {json.dumps(report['metrics'])}")
            if recount != round(solver.objective_value):
                raise SystemExit(f"OBJECTIVE MISMATCH: the solver reads {solver.objective_value:g}, "
                                 f"the recount {recount}")


if __name__ == "__main__":
    main()
