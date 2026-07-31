# Rail Cube — optimising track layouts

A constraint model for [Rail Cube](https://www.railcube.co.uk/), a children's magnetic
monorail toy: cube blocks click together into 3D tracks and a mini train runs along them,
including up walls and upside down. Each cube carries a moulded rail on its outside face, so
the shape of the structure is what steers the train.

The question is what the best track you can build from one set actually is — and the answer
turns out to be that all 36 cubes of a real set go into a single closed loop with nothing
left over.

## Layout

| | |
|---|---|
| `src/track.js` | poses, the piece catalogue, `SCORES`, both hard constraints. The single source of truth |
| `src/routes.js`, `src/layouts.js` | known-good routes, and the layouts the solver found |
| `src/enumerate.js` | brute-force DFS — the oracle the solver is checked against |
| `src/solver/` | the CP-SAT model, behind the `solveTrack` facade |
| `site/` | the SvelteKit showcase site |
| `docs/` | the coordinate system and the physical piece reference |
| `scripts/` | benchmarks, and `build-sheet` — a layout printed as a click-together order |

## Running it

```sh
npm install          # the model's dependencies (cpsat-js)
npm test             # the fast tier, ~73 s. SLOW=1 npm test adds the exhaustive searches
npm run build-sheet -- owen    # print a layout as build instructions

npm --prefix site install
npm run site         # the showcase site, on http://localhost:5173
npm run site:build   # a static build, into site/build
```

The site imports the model from `src/` by relative path rather than copying it, so both
installs are needed before it will build.

## Deployment

`.github/workflows/pages.yml` builds the site and publishes it to GitHub Pages on every push
to `main`. It needs Pages turned on first: **Settings → Pages → Source: GitHub Actions**.
Until that is done the build step passes and the deploy step fails, which is expected rather
than a problem with the workflow.

## The solver

Optimisation uses [cpsat-js](https://github.com/owen-lacey/cpsat-js), a WebAssembly port of
Google OR-Tools' CP-SAT that runs in the browser with no native dependencies. The site's
`/solve` page runs a real search in a Web Worker in front of you — which is also why the
browser gets the single-threaded build: the threaded one is five to ten times faster but
cannot report progress mid-search, so the page would sit blank until the end.

See `CLAUDE.md` for the working notes, the measured results, and the mistakes worth not
repeating.
