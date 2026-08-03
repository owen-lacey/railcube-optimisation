<script>
  import TrackViewer from './TrackViewer.svelte';
  import { sceneFromRoute, cubesIn, scoreOf } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    aspect = '16 / 10',
    drive = true,
    interactive = true,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // The shape is re-derived through `chainTrack`, which throws unless the route
  // closes and nothing collides — so an illegal string gets the model's own
  // objection, not a drawing of nonsense.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: sceneFromRoute(routeOf(letters)) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });
</script>

{#if result.state === 'ok'}
  <TrackViewer
    pieces={result.scene.pieces}
    camera={result.scene.camera}
    {drive}
    {aspect}
    {interactive}
    label="The layout {letters}"
  />
  <p class="caption">
    <span class="shape">{letters}</span>
    <span class="muted">
      {cubesIn(result.scene.pieces)} cubes · {scoreOf(result.scene.pieces)} pts
    </span>
  </p>
{:else}
  <div class="empty" style:aspect-ratio={aspect}>
    {#if result.state === 'invalid'}
      <p class="failed">Not a legal track: {result.message}.</p>
      <p class="shape">{letters}</p>
    {:else}
      <p>Nothing to draw yet — give it a shape string.</p>
    {/if}
  </div>
{/if}

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
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>
