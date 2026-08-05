<script>
  import TrackViewer from './TrackViewer.svelte';
  import { sceneFromRoute, cubesIn, scoreOf } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    aspect = '16 / 10',
    drive = true,
    interactive = true,
    pace = 0.04,
    speed = 1.2,
    handover = 0.5,
    drop = 2,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // The shape is re-derived through `chainTrack`, which throws unless the route
  // closes and nothing collides — so an illegal string gets the model's own
  // objection, not a drawing of nonsense.
  //
  // An illegal shape unmounts the viewer below, which destroys the stage and the
  // cubes on it. So the next legal shape has nothing to knock down and is drawn
  // finished, exactly as the first one was. That is deliberate: the alternative is
  // machinery for keeping a track alive behind an error message.
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
    sequence
    {pace}
    {speed}
    {handover}
    {drop}
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
    text-align: center;
  }

  .empty p {
    margin: 0;
  }

  .caption {
    text-align: center;
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>
