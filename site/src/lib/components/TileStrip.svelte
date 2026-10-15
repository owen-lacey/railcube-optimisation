<script>
  // A row of layouts as tiles to pick one from, for a viewer's dock. A tile not
  // picked is veiled, like a character not yet chosen; every tile has its rank and
  // score along its foot. Handed new tracks, the strip goes back to its start.
  import TrackViewer from './TrackViewer.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { layoutScene } from '$lib/scenes.js';

  // `tracks` is `{ id, shape, score }`, best first; `picked` the index of the one
  // shown large; `label` names the group.
  let { tracks, picked = $bindable(0), label } = $props();

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

  $effect(() => {
    tracks;
    if (!scroller) return;
    scroller.scrollLeft = 0;
    measure();
  });

  const score = s => `${s < 0 ? '−' : ''}${Math.abs(s)}`;
</script>

<div class="strip">
  <div class="tiles" role="group" aria-label={label} bind:this={scroller} bind:clientWidth={stripWidth} onscroll={measure}>
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
