<script>
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import TrackViewer from '$lib/components/TrackViewer.svelte';
  import { sceneFromRoute } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  // Read in the browser only: touching `url.searchParams` during prerender is an
  // error, and the prerendered HTML is the shell below regardless of the query.
  const shape = $derived(
    browser ? (page.url.searchParams.get('shape') ?? '').trim().toUpperCase() : ''
  );

  // The same rule as everywhere else on the site: the shape is re-derived through
  // `chainTrack`, which throws unless the route closes and nothing collides — so
  // an illegal URL gets the model's own objection, not a drawing of nonsense.
  const result = $derived.by(() => {
    if (!shape) return { state: 'empty' };
    try {
      return { state: 'ok', scene: sceneFromRoute(routeOf(shape)) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });
</script>

<svelte:head>
  <title>View a layout — Rail Cube</title>
  <meta
    name="description"
    content="Paste any Rail Cube shape string into the URL and see it rendered as a 3D track,
      checked for legality first."
  />
</svelte:head>

<section>
  <h1>View a layout</h1>
  <p class="lede">
    Give this page a shape string — <code>?shape=LIRIROSOLORLLSORII</code> — and it chains the
    route, checks it is a legal closed loop, and renders it with the train running.
  </p>
  <p class="prose muted">
    One letter per piece: <span class="mono">S</span> straight, <span class="mono">L</span> left
    curve, <span class="mono">R</span> right curve, <span class="mono">I</span> inside curve,
    <span class="mono">O</span> outside curve, <span class="mono">X</span> cross.
  </p>
</section>

<section>
  {#if result.state === 'ok'}
    <TrackViewer
      pieces={result.scene.pieces}
      camera={result.scene.camera}
      drive
      aspect="16 / 10"
      label="The layout {shape}"
    />
    <p class="shape caption">{shape}</p>
  {:else}
    <div class="empty" style:aspect-ratio="16 / 10">
      {#if result.state === 'invalid'}
        <p class="failed">Not a legal track: {result.message}.</p>
        <p class="shape">{shape}</p>
      {:else}
        <p>Nothing to draw yet — add <code>?shape=…</code> to the address.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .empty {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.4rem;
    border: 1px dashed var(--line);
    border-radius: 10px;
    background: #0b1222;
    padding: 1rem;
    text-align: center;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
    max-width: 48ch;
  }

  .empty .failed {
    color: #fca5a5;
  }

  .caption {
    margin-top: 0.7rem;
    text-align: center;
  }
</style>
