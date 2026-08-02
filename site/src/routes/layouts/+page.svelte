<script>
  import TrackViewer from '$lib/components/TrackViewer.svelte';
  import ViewLink from '$lib/components/ViewLink.svelte';
  import { solvedLayouts, loop, inversion } from '$lib/scenes.js';

  const handBuilt = [loop, inversion];

  // Biggest first: the 36-cube layout is the headline, and a grid that opens on
  // it reads as a result rather than a catalogue.
  const solved = [...solvedLayouts].sort((a, b) => b.cubes - a.cubes);

  let expanded = $state(solved[0].id);
</script>

<svelte:head>
  <title>The layouts — Rail Cube</title>
  <meta
    name="description"
    content="Track layouts CP-SAT found for Rail Cube, including all 36 cubes of a real set in
      one closed loop, plus the hand-built reference loops."
  />
</svelte:head>

<section>
  <h1>What the solver found</h1>
  <p class="lede">
    Each of these is an answer to a question, not decoration. They are stored as shape strings
    and re-derived here: chained for legality and counted against the set they claim to be
    built from, every time the page loads.
  </p>
  <p class="prose muted">
    That check earns its keep. An early version of this list contained a layout that could not
    be built — the model pooled the green and blue curves into one allowance, so the solver
    spent six right curves and two left ones. Nothing in the model caught it; it was spotted by
    eye, from a photograph.
  </p>
</section>

<section>
  <h2>Solved</h2>
  <div class="grid">
    {#each solved as layout (layout.id)}
      <article class="panel card" class:open={expanded === layout.id}>
        <TrackViewer
          pieces={layout.pieces}
          camera={layout.camera}
          drive
          aspect="4 / 3"
          interactive={expanded === layout.id}
          label={layout.title}
        />
        <h3>{layout.title}</h3>
        <ul class="tags">
          <li class="tag">{layout.cubes} cubes</li>
          {#if layout.steps !== layout.cubes}
            <li class="tag">{layout.steps} steps</li>
          {/if}
          <li class="tag">{layout.score} pts</li>
          <li class="tag">box {layout.box}</li>
          {#if layout.held - layout.cubes === 0}
            <li class="tag good">nothing dropped</li>
          {:else}
            <li class="tag">{layout.held - layout.cubes} left over</li>
          {/if}
          <li class="tag">{layout.proved ? 'proved optimal' : 'best found'}</li>
        </ul>
        <p class="shape">{layout.shape}</p>
        <ViewLink shape={layout.shape} />
        <button
          type="button"
          onclick={() => (expanded = expanded === layout.id ? null : layout.id)}
          aria-pressed={expanded === layout.id}
        >
          {expanded === layout.id ? 'Locked for dragging' : 'Unlock to drag'}
        </button>
      </article>
    {/each}
  </div>
  <p class="muted note">
    Only one view claims your drag at a time, so the page still scrolls on a touch screen.
    Tap <em>Unlock to drag</em> on the one you want to turn.
  </p>
</section>

<section>
  <h2>Built by hand</h2>
  <p class="prose muted">
    Two reference loops, written out piece by piece rather than searched for. They are what the
    model was checked against before it was trusted to find anything.
  </p>
  <div class="grid wide">
    {#each handBuilt as scene (scene.id)}
      <article class="panel card">
        <TrackViewer
          pieces={scene.pieces}
          camera={scene.camera}
          drive
          aspect="4 / 3"
          label={scene.title}
        />
        <h3>{scene.title}</h3>
        <p class="muted detail">{scene.blurb}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .card h3 {
    margin: 0.3rem 0 0;
    font-size: 1rem;
  }

  .card.open {
    border-color: #46557d;
  }

  .card button {
    align-self: flex-start;
    font-size: 0.82rem;
    margin-top: auto;
  }

  .detail {
    margin: 0;
    font-size: 0.88rem;
  }

  .note {
    font-size: 0.86rem;
    margin-top: 1rem;
  }

  .grid.wide {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }
</style>
