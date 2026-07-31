<script>
  import { onDestroy } from 'svelte';
  import TrackViewer from '$lib/components/TrackViewer.svelte';
  import { paint, frame, cubesIn } from '$lib/scenes.js';
  import { chainTrack } from '../../../../src/track.js';
  import { routeOf } from '../../../../src/layouts.js';

  let worker = null;
  let solutions = $state([]);
  let selected = $state(-1);
  let following = $state(true); // whether new layouts take over the canvas
  let phase = $state('idle');   // idle | loading | running | done | failed
  let message = $state('');

  const current = $derived(selected >= 0 ? solutions[selected] : null);
  const running = $derived(phase === 'loading' || phase === 'running');

  function start() {
    stop();
    solutions = [];
    selected = -1;
    following = true;
    phase = 'loading';
    message = 'loading the solver — about six megabytes of WebAssembly, once';

    // A relative literal, not the $lib alias: Vite resolves `new URL(…,
    // import.meta.url)` statically at build time and cannot see through an alias.
    worker = new Worker(new URL('../../lib/solve-worker.js', import.meta.url), { type: 'module' });

    // A worker that fails to load never sends a message, so without this the
    // page would sit on "loading the solver" for ever with nothing in the log.
    worker.onerror = event => {
      phase = 'failed';
      message = event.message || 'the solver worker failed to start';
    };

    worker.onmessage = ({ data }) => {
      if (data.type === 'loading') return;

      if (data.type === 'error') {
        phase = 'failed';
        message = data.message;
        return;
      }

      if (data.type === 'done') {
        phase = 'done';
        message = data.stopped
          ? `stopped after ${solutions.length} layouts`
          : data.truncated
            ? `stopped at ${data.count} layouts — the cap, not the end of the list`
            : `enumerated all ${data.count} layouts — none left to find`;
        return;
      }

      // Re-chained here rather than trusted from the worker, so the layout on
      // screen is derived from the route the solver claimed by the same code
      // every other scene on this site uses. An illegal one throws.
      const pieces = paint(chainTrack(routeOf(data.shape)));
      solutions = [...solutions, {
        index: data.index,
        seconds: data.seconds,
        score: data.score,
        shape: data.shape,
        cubes: cubesIn(pieces),
        pieces,
        // Framed from the first layout only, then reused. Reframing every time
        // makes the camera jump about while the thing you are watching is the
        // layout — and every layout of one inventory is much of a size anyway.
        camera: solutions.length ? solutions[0].camera : frame(pieces),
      }];
      phase = 'running';
      message = `layout ${data.index + 1} of ${data.total} — searching`;
      if (following) selected = solutions.length - 1;
    };

    worker.postMessage({ type: 'start', maxTimeInSeconds: 300 });
  }

  function stop() {
    if (!worker) return;
    worker.postMessage({ type: 'stop' });
    worker.terminate();
    worker = null;
    if (running) {
      phase = solutions.length ? 'done' : 'idle';
      message = solutions.length ? `stopped after ${solutions.length} layouts` : '';
    }
  }

  function pick(i) {
    selected = i;
    following = false; // looking at an old one means you did not want to be moved off it
  }

  function resume() {
    following = true;
    if (solutions.length) selected = solutions.length - 1;
  }

  onDestroy(stop);
</script>

<svelte:head>
  <title>Watch it solve — Rail Cube</title>
  <meta
    name="description"
    content="CP-SAT enumerating full-inventory Rail Cube layouts live in the browser, with
      play/pause and every layout it has found so far."
  />
</svelte:head>

<section>
  <h1>Watch it solve</h1>
  <p class="lede">
    Sixteen cubes — four of every curve, no straights — and a demand that every one of them is
    spent. This runs CP-SAT in your browser and streams out distinct legal layouts, roughly one
    every two or three seconds, until it runs out.
  </p>
  <p class="prose muted">
    Every layout it finds scores exactly the same. That is not a bug, it is the finding: the
    objective sums a fixed value per cube, so when the optimum spends the whole inventory the
    score is a constant — independent of the arrangement <em>and</em> of the weights. Every
    full-inventory loop ties. Re-weighting the piece types cannot break those ties; only a term
    that reads the arrangement could.
  </p>
</section>

<section class="console">
  <div class="stage">
    {#if current}
      <TrackViewer
        pieces={current.pieces}
        camera={current.camera}
        drive
        aspect="16 / 10"
        label="Layout {current.index + 1} of the search"
      />
    {:else}
      <div class="empty" style:aspect-ratio="16 / 10">
        <p>
          {#if phase === 'loading'}
            Loading the solver…
          {:else if phase === 'running'}
            Searching — nothing to draw until the first layout.
          {:else if phase === 'failed'}
            The search failed.
          {:else}
            Press start. The first layout takes a few seconds.
          {/if}
        </p>
      </div>
    {/if}

    <div class="controls">
      {#if running}
        <button type="button" onclick={stop}>Stop the search</button>
      {:else}
        <button type="button" class="primary" onclick={start}>
          {solutions.length ? 'Search again' : 'Start the search'}
        </button>
      {/if}

      <button
        type="button"
        onclick={() => (following ? (following = false) : resume())}
        disabled={!solutions.length}
        aria-pressed={!following}
      >
        {following ? 'Pause' : 'Follow the search'}
      </button>

      {#if current}
        <span class="reading mono">
          layout {current.index + 1} · {current.cubes} cubes · {current.score} pts ·
          found at {current.seconds.toFixed(1)}s
        </span>
      {/if}
    </div>

    <p class="status" class:failed={phase === 'failed'}>{message || ' '}</p>

    <p class="muted fine">
      Pause holds the canvas where it is; the search carries on behind it and the list keeps
      filling. It cannot pause the search itself — CP-SAT blocks its thread for the whole of
      each round, so the only honest controls are “stop looking” and “stop searching”.
    </p>
  </div>

  <aside class="history" aria-label="Layouts found">
    <h2>Found so far</h2>
    {#if !solutions.length}
      <p class="muted fine">Nothing yet.</p>
    {:else}
      <ol>
        {#each solutions as s, i (s.index)}
          <li>
            <button
              type="button"
              class="entry"
              class:active={i === selected}
              onclick={() => pick(i)}
              aria-current={i === selected ? 'true' : undefined}
            >
              <span class="n mono">{s.index + 1}</span>
              <span class="t mono">{s.seconds.toFixed(1)}s</span>
              <span class="sc mono">{s.score} pts</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </aside>
</section>

<section>
  <h2>Why it is set up this way</h2>
  <div class="prose muted">
    <p>
      The browser runs the single-threaded build of the solver, on purpose. The threaded one is
      five to ten times faster, but it reports its progress from a pthread that cannot call back
      into JavaScript mid-search — so the page would sit blank until the very end. Single-worker
      and watchable beats threaded and blank.
    </p>
    <p>
      The sixteen-cube set is measured, not guessed. Against the model's own eighteen-cube set —
      the same thing plus two straights — each new layout took sixteen to seventy seconds instead
      of two or three, because straights are interchangeable filler that multiply the search
      without helping the loop close. Four of one handedness is the floor a loop can close at, so
      this is as small as a curves-only set gets.
    </p>
    <p>
      Forcing the full inventory turned out to be the better watch as well as the truer question.
      Left to itself the solver reaches for the cheapest answer first — a four-piece ring,
      dropping twelve of the sixteen cubes — and grows the loop a cube at a time from there.
      Slower per round, and a much duller thing to look at.
    </p>
  </div>
</section>

<style>
  .console {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 230px;
    gap: 1.5rem;
    align-items: start;
  }

  .empty {
    display: grid;
    place-items: center;
    border: 1px dashed var(--line);
    border-radius: 10px;
    background: #0b1222;
    padding: 1rem;
    text-align: center;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
    max-width: 34ch;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }

  .reading {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .status {
    margin: 0.7rem 0 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.2em;
  }

  .status.failed {
    color: #fca5a5;
  }

  .fine {
    font-size: 0.83rem;
    max-width: 62ch;
  }

  .history h2 {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 0.6rem;
  }

  .history ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .entry {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.78rem;
    background: transparent;
    border-color: transparent;
    text-align: left;
  }

  .entry:hover {
    background: #ffffff10;
  }

  .entry.active {
    background: #ffffff18;
    border-color: var(--line);
    color: var(--fg);
  }

  .entry .n {
    color: var(--accent);
    min-width: 1.6em;
  }

  .entry .t {
    color: var(--muted);
    flex: 1;
  }

  .entry .sc {
    color: var(--muted);
  }

  @media (max-width: 820px) {
    .console {
      grid-template-columns: minmax(0, 1fr);
    }

    /* On a narrow screen the list becomes a strip under the canvas rather than a
       column beside it — a sidebar here would squeeze the 3D view to nothing. */
    .history ol {
      flex-direction: row;
      overflow-x: auto;
      max-height: none;
      padding-bottom: 0.35rem;
    }

    .entry {
      border-color: var(--line);
      white-space: nowrap;
    }
  }
</style>
