<script>
  // The combined score, worked out: one layout drawn large with the maths of its
  // score under it (`ScoreMaths`), and the crossed sweep's hundred best under equal
  // weights as tiles docked along the viewer's bottom to pick it from. A tile not
  // picked is veiled, like a
  // character not yet chosen; every tile has its rank and score along its foot. The
  // ranking is `scripts/rank-tracks.js`'s. A figure on its own only, since the
  // tiles are viewers of their own.
  import LayoutViewer from './LayoutViewer.svelte';
  import ScoreMaths from './ScoreMaths.svelte';
  import TrackViewer from './TrackViewer.svelte';
  import { MediaQuery, SvelteSet } from 'svelte/reactivity';
  import { layoutScene } from '$lib/scenes.js';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

  // `train` is the large viewer's: its callbacks, or null for no train.
  let { ranked = SWEEP_CROSSED_RANKED, train = {} } = $props();

  const tracks = $derived(ranked.best);

  let picked = $state(0);
  const shape = $derived(tracks[picked].shape);

  // Narrow, the viewer is taller to leave the track room above the tiles.
  const wide = new MediaQuery('min-width: 40rem');
  const aspect = $derived(wide.current ? '16 / 10' : '4 / 3');

  // A tile's viewer is mounted the first time its tile comes within a scroller's
  // length of being seen, and kept: a still viewer draws once and then costs
  // nothing, but a hundred stages built at once is what this avoids.
  let scroller = $state(null);
  const near = new SvelteSet();
  let observer = $state(null);

  $effect(() => {
    if (!scroller) return;
    const watching = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        near.add(Number(entry.target.getAttribute('data-index')));
        watching.unobserve(entry.target);
      }
    }, { root: scroller, rootMargin: '100%' });
    observer = watching;
    return () => watching.disconnect();
  });

  const watched = node => {
    const watching = observer;
    if (!watching) return;
    watching.observe(node);
    return () => watching.unobserve(node);
  };

  // Whether there are tiles out of sight either way, for the blur over that edge.
  // Read on a scroll and whenever the strip changes width.
  let stripWidth = $state(0);
  let more = $state({ before: false, after: false });
  const measure = () => {
    if (!scroller) return;
    const { scrollLeft, clientWidth, scrollWidth } = scroller;
    more = { before: scrollLeft > 1, after: scrollLeft + clientWidth < scrollWidth - 1 };
  };
  $effect(() => {
    stripWidth;
    measure();
  });

  const score = s => `${s < 0 ? '−' : ''}${Math.abs(s).toFixed(2)}`;
</script>

{#snippet maths()}
  <ScoreMaths {shape} ranges={ranked.ranges} weights={ranked.weights} />
{/snippet}

{#snippet tiles()}
  <div class="strip">
    <div class="tiles" role="group" aria-label="The hundred best layouts" bind:this={scroller} bind:clientWidth={stripWidth} onscroll={measure}>
      {#each tracks as track, i (track.id)}
        <button
          type="button"
          class="tile"
          aria-pressed={i === picked}
          aria-label="Layout {i + 1} of {tracks.length}, scoring {score(track.score)}"
          data-index={i}
          onclick={() => (picked = i)}
          {@attach watched}
        >
          {#if near.has(i)}
            {@const scene = layoutScene(track.shape)}
            <TrackViewer pieces={scene.pieces} camera={scene.camera} aspect="1 / 1" label="The layout {track.shape}" />
          {:else}
            <span class="unmounted"></span>
          {/if}
          <span class="veil"></span>
          <span class="label" aria-hidden="true">
            <span class="rank">#{i + 1}</span>
            <span class="score">{score(track.score)}</span>
          </span>
        </button>
      {/each}
    </div>
  <span class="blur before" class:shown={more.before}></span>
  <span class="blur after" class:shown={more.after}></span>
  </div>
{/snippet}

<LayoutViewer
  {shape}
  {train}
  {aspect}
  transition={{ kind: 'move', pan: 0.6 }}
  caption={maths}
  dock={tiles}
/>

<style>
  /* No scrollbar: the half tile at the end says there is more, and a swipe, a
     wheel or the keyboard (each tile is a button) still scrolls. */
  .strip {
    position: relative;
  }

  /* Over an edge with tiles cut off past it: what is under it blurs more the
     nearer the edge, so a cut-off tile reads as going on rather than chopped. */
  .blur {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2.5rem;
    pointer-events: none;
    backdrop-filter: blur(3px);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .blur.shown {
    opacity: 1;
  }

  .blur.before {
    left: 0;
    mask-image: linear-gradient(to left, transparent, black);
  }

  .blur.after {
    right: 0;
    mask-image: linear-gradient(to right, transparent, black);
  }

  .tiles {
    display: flex;
    gap: 0.375rem;
    overflow: auto hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .tiles::-webkit-scrollbar {
    display: none;
  }

  /* One size at every width: five and a bit across a phone. */
  .tile {
    position: relative;
    flex: 0 0 3rem;
    padding: 0;
    border: 2px solid var(--card-border);
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--viewer-background);
    color: var(--ink);
    cursor: pointer;
    scroll-snap-align: start;
  }

  .tile[aria-pressed='true'] {
    border-color: var(--grid-color);
  }

  .unmounted {
    display: block;
    aspect-ratio: 1 / 1;
  }

  /* A tile's viewer is a picture, not a handle. */
  .veil {
    position: absolute;
    inset: 0;
    background: var(--veil);
  }

  .tile[aria-pressed='true'] .veil {
    display: none;
  }

  .label {
    position: absolute;
    inset: auto 0 0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 0.2rem;
    background: color-mix(in srgb, var(--card-footer) 85%, transparent);
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }

  .rank {
    color: var(--muted);
    font-size: 0.55rem;
  }

  .score {
    font-size: 0.65rem;
    font-weight: 700;
  }
</style>
