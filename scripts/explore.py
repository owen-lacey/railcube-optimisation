# /// script
# requires-python = ">=3.11"
# dependencies = ["ortools"]
# ///
"""The track model on native OR-Tools, for exploration.

    uv run scripts/explore.py
    uv run scripts/explore.py --set '{"leftCurve":4}' --time 10
    uv run scripts/explore.py --hint LIRIROSOLORLLSORII

Native CP-SAT threads are worth 5-10x over the browser WASM build, so this is
the place to try inventories, boxes and objectives quickly. It is the core
optimiser only: no crossings encoding, no cross piece, no allSolutions loop —
src/solver/index.js remains the model of record and the two are kept diffable
function by function.

Every piece in the inventory must be used: the loop length is always
sum(inventory.values()) and there is no partial-spend mode. That makes this a
satisfiability model, not an optimisation one — once the whole inventory is
spent every arrangement ties on score (see "SCORES is inert" in CLAUDE.md), so
there is no `model.maximize` here; the score is computed arithmetically from
the inventory for reporting only. This is a deliberate divergence from
src/solver/index.js, which still allows dropping pieces — see the `explore.py`
section of CLAUDE.md.

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
import json
import subprocess
from pathlib import Path

from ortools.sat.python import cp_model

REPO = Path(__file__).resolve().parent.parent
MAX_FOOT = 4  # the most cells any piece's material fills


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
    """The box and the floor bind material cells, not the head."""
    for i, sels in enumerate(selectors):
        for k in range(MAX_FOOT):
            def cell_at(row, k=k):
                cells = cells_of(geo, row, "material")
                return cells[k] if k < len(cells) else None

            used = model.new_bool_var(f"inBox_{i}_{k}")
            model.add(used == pick(sels, rows, lambda r: 1 if cell_at(r) else 0))
            for a, axis in enumerate((x, y, z)):
                coord = axis[i] + pick(sels, rows, lambda r: (cell_at(r) or (0, 0, 0))[a])
                model.add(coord <= box).only_enforce_if(used)
                floor = min_y if a == 1 and min_y is not None else -box
                model.add(coord >= floor).only_enforce_if(used)


def grid(box):
    # Heads live within box + 1 and a train cell reaches one further again;
    # undersize the span and two distinct cells fold onto the same id.
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


def hint_route(model, geo, rows, selectors, route, start_pose):
    """Walk the route through the transition table and hint the true selectors."""
    if len(route) != len(selectors):
        raise SystemExit(f"hint is {len(route)} pieces but there are {len(selectors)} steps — "
                         "every piece is used now, so the hint must be full-length")
    p, cell = geo["poses"].index(start_pose), [0, 0, 0]
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
    if p != geo["poses"].index(start_pose) or cell != [0, 0, 0]:
        raise SystemExit("hint route does not close back to where it started")


def build_model(geo, rows, p):
    model = cp_model.CpModel()
    start = geo["poses"].index(p.start_pose)
    steps, box, min_y = p.steps, p.box, p.min_y

    # Head position and pose before each step, plus one more for after the last.
    # The head's own domain is one wider than the box, because the box binds
    # material cells and a head can sit at the edge of a footprint inside it.
    reach = box + 1
    x = [model.new_int_var(-reach, reach, f"x_{i}") for i in range(steps + 1)]
    y = [model.new_int_var(-reach if min_y is None else min_y - 1, reach, f"y_{i}")
         for i in range(steps + 1)]
    z = [model.new_int_var(-reach, reach, f"z_{i}") for i in range(steps + 1)]
    pose = [model.new_int_var(0, len(geo["poses"]) - 1, f"pose_{i}") for i in range(steps + 1)]

    selectors = []
    for i in range(steps):
        sels = [model.new_bool_var(f"sel_{i}_{r}") for r in range(len(rows))]
        model.add_exactly_one(sels)
        selectors.append(sels)

    add_transitions(model, rows, selectors, x, y, z, pose)

    # The loop closes on cell AND pose, at both ends.
    for v, want in [(x[0], 0), (y[0], 0), (z[0], 0), (pose[0], start),
                    (x[steps], 0), (y[steps], 0), (z[steps], 0), (pose[steps], start)]:
        model.add(v == want)

    bound_material(model, geo, rows, selectors, x, y, z, box, min_y)
    if p.collisions:
        add_collisions(model, geo, rows, selectors, x, y, z, box, steps, p.check_train)
    add_inventory(model, geo, rows, selectors, p.inventory)
    if p.symmetry:
        break_mirror_symmetry(model, geo, rows, selectors)

    if p.hint:
        hint_route(model, geo, rows, selectors, p.hint, p.start_pose)
    return model, selectors


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


def verify(shape):
    report = json.loads(run_node("scripts/check-route.js", shape, "--any"))
    if not report.get("legal"):
        raise SystemExit(f"VERIFICATION FAILED: {json.dumps(report)}")
    return report


def parse_args(geo):
    ap = argparse.ArgumentParser(description="Explore the track model on native OR-Tools.")
    ap.add_argument("--box", type=int, default=6)
    ap.add_argument("--miny", type=int, default=0, help="floor; 0 = nothing below ground")
    ap.add_argument("--no-floor", action="store_true", help="unset the floor (minY = null)")
    ap.add_argument("--exclude", default="cross", help="comma-separated piece types")
    ap.add_argument("--start-pose", default="UF")
    ap.add_argument("--set", dest="set_json", help="inventory as JSON (default: the 18-cube SET)")
    ap.add_argument("--hint", help="shape string to start the search from")
    ap.add_argument("--time", type=float, default=180, help="max solve seconds")
    ap.add_argument("--workers", type=int, default=8)
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
    if a.inventory.get("cross", 0) > 0 and "cross" in a.exclude:
        ap.error("the inventory holds crosses but this script has no crossing encoding")
    if a.symmetry and a.inventory.get("leftCurve", 0) != a.inventory.get("rightCurve", 0):
        ap.error("--symmetry is only sound with equal left and right curve counts")
    letters_to_type = {l: t for t, l in geo["letters"].items()}
    a.hint = [letters_to_type[l] for l in a.hint] if a.hint else None
    return a


def main():
    geo = load_geometry()
    p = parse_args(geo)
    rows = filter_rows(geo, p.exclude)
    held = sum(p.inventory.values())
    print(f"steps={p.steps} (every piece used)  box {p.box}  floor {p.min_y}  workers {p.workers}"
          f"  inventory {p.inventory}")

    model, selectors = build_model(geo, rows, p)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.time
    solver.parameters.num_search_workers = p.workers
    status = solver.solve(model, Incumbent(geo, rows, selectors, held))

    name = solver.status_name(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise SystemExit(f"{name} after {solver.wall_time:.1f}s — "
                         "this inventory cannot be fully spent in this box")

    route = read_route(lambda v: solver.value(v) == 1, geo, rows, selectors)
    score = sum(geo["scores"][t] for t in route)
    shape = "".join(geo["letters"][t] for t in route)
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


if __name__ == "__main__":
    main()
