<script>
  // The front page: pick a configuration, shuffle, watch a solve. The 28-cube
  // sweep is every distinct full-spend layout its run found, and the crossed one
  // a uniform sample of its database (see lib/sweeps.js), so a shuffle is a draw
  // from the answers, not a pick of highlights.
  import { MediaQuery } from 'svelte/reactivity';
  import LayoutViewer from '$lib/components/LayoutViewer.svelte';
  import { SWEEP_28, SWEEP_CROSSED } from '$lib/sweeps.js';

  // Narrow screens get a taller viewer: the zoom fit is height-bound at 16/10
  // (see camera.js), so 4/3 alone is worth ~20%.
  const narrow = new MediaQuery('(max-width: 640px)', false);

  const CONFIGS = [
    { key: '28', label: '28 cubes', sweep: SWEEP_28 },
    { key: 'crossed', label: '35 cubes, one cross', sweep: SWEEP_CROSSED },
  ];

  // The key rather than the config itself: `$state` proxies an object, so the
  // proxy never compares equal to the CONFIGS entry it wraps.
  let selected = $state(CONFIGS[0].key);
  // The first shape in the file, not a random one: the page is prerendered, and
  // the server and the browser must agree on what the HTML says. Randomness is
  // the button's job.
  let shape = $state(CONFIGS[0].sweep.shapes[0].shape);

  const config = $derived(CONFIGS.find(c => c.key === selected));

  // Off, a shuffle is an instant redraw framed tight on the new layout. On, it is
  // the collapse-and-rebuild.
  let animate = $state(true);

  let autoShuffle = $state(false);
  // A log slider, so the fast end — flicking through solves — gets as much travel
  // as the slow end. `notch` 0…100 maps to MIN_MS…MAX_MS geometrically.
  const MIN_MS = 100;
  const MAX_MS = 30_000;
  let notch = $state(60);
  const every = $derived(Math.round(MIN_MS * (MAX_MS / MIN_MS) ** (notch / 100)));
  const everyLabel = $derived(every < 1000 ? `${every}ms` : `${(every / 1000).toFixed(1)}s`);

  $effect(() => {
    if (!autoShuffle) return;
    const timer = setInterval(shuffle, every);
    return () => clearInterval(timer);
  });

  function select(next) {
    if (next.key === selected) return;
    selected = next.key;
    shape = next.sweep.shapes[0].shape;
  }

  function shuffle() {
    const { shapes } = config.sweep;
    const pick = () => shapes[Math.floor(Math.random() * shapes.length)].shape;
    // One re-roll if the draw lands on what is already showing — a shuffle that
    // visibly does nothing reads as a broken button.
    const next = pick();
    shape = next === shape ? pick() : next;
  }
</script>

<svelte:head>
  <title>Rail Cube solves</title>
</svelte:head>

<h1>Rail Cube solves</h1>
<p class="intro">
  Closed loops that spend every piece in the box. Pick a set of pieces, then
  shuffle for another way to build it.
</p>

<div class="controls">
  <div class="configs" role="group" aria-label="Piece set">
    {#each CONFIGS as c (c.key)}
      <button class:active={c.key === selected} onclick={() => select(c)}>
        {c.label}
        <span class="count">{c.sweep.shapes.length.toLocaleString('en-GB')} solves</span>
      </button>
    {/each}
  </div>
  <div class="toggles">
    <label><input type="checkbox" bind:checked={animate} /> Animate</label>
    <label><input type="checkbox" bind:checked={autoShuffle} /> Auto shuffle</label>
    <label class="every" class:off={!autoShuffle}>
      <input type="range" min="0" max="100" step="1" bind:value={notch} disabled={!autoShuffle} />
      every {everyLabel}
    </label>
  </div>
  <button class="shuffle" onclick={shuffle}>Shuffle</button>
</div>

<!-- Keyed on the configuration: sweeps hold different inventories, and a
     rearrangement across them would strand the difference on the floor. Within a
     configuration the viewer stays mounted, so a shuffle is the collapse-and-
     rebuild. `reach` is the box the sweep was solved in — a box of 8 outreaches
     the default frame. Keyed on `animate` too, because TrackViewer
     reads it once at mount — it decides the frame and whether the physics loads. -->
{#key `${config.key}:${animate}`}
  <LayoutViewer
    {shape}
    reach={config.sweep.question.box}
    change={animate ? 'tumble' : 'none'}
    aspect={narrow.current ? '4 / 3' : '16 / 10'}
  />
{/key}

<style>
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.6rem;
    letter-spacing: -0.01em;
  }

  .intro {
    margin: 0 0 2rem;
    color: var(--muted);
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .configs {
    display: flex;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  button {
    font: inherit;
    color: var(--ink);
    background: var(--wash);
    border: none;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
  }

  .configs button + button {
    border-left: 1px solid var(--rule);
  }

  .configs button.active {
    background: var(--ink);
    color: var(--wash);
  }

  .toggles {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.9rem;
  }

  .toggles label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }

  .every {
    font-variant-numeric: tabular-nums;
  }

  .every.off {
    color: var(--muted);
  }

  .count {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .configs button.active .count {
    color: var(--rule);
  }

  .shuffle {
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1.4rem;
  }

  .shuffle:hover,
  .configs button:not(.active):hover {
    background: color-mix(in srgb, var(--wash), var(--ink) 6%);
  }
</style>
