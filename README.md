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
| `site/` | the SvelteKit app the blog post will be written in, and the components it draws with |
| `.storybook/` | the Storybook those components are developed in |
| `docs/` | the coordinate system and the physical piece reference |
| `scripts/` | benchmarks, and `build-sheet` — a layout printed as a click-together order |

## Running it

One `package.json` at the root covers the model, the app and Storybook, so one install does
everything — the app imports the model from `src/` by relative path, and they share a
`node_modules`.

```sh
npm install          # the model, the app and Storybook
npm test             # the fast tier, ~73 s. SLOW=1 npm test adds the exhaustive searches
npm run build-sheet -- owen    # print a layout as build instructions

npm run storybook    # the components, on http://localhost:6006
npm run dev          # the app, on http://localhost:5173
npm run build        # a static build, into build/
```

The site deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`):
a solve viewer on the front page, the draft blog post at `/post`.

## The solver

Optimisation uses [cpsat-js](https://github.com/owen-lacey/cpsat-js), a WebAssembly port of
Google OR-Tools' CP-SAT that runs in the browser with no native dependencies. Nothing in the
app solves — the layouts it draws are shape strings the solver has already found — but the
port reports improving solutions through `onSolution`, so a search can be animated if the
post ever wants one.

See `CLAUDE.md` for the working notes, the measured results, and the mistakes worth not
repeating.
