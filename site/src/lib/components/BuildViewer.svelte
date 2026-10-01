<script>
  import TrackViewer from './TrackViewer.svelte';
  import { sceneFromRoute, cubesIn } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    pace = 0.1,
    speed = 1,
    aspect = '16 / 10',
    // Handling, or null — see `controls` in TrackViewer.
    controls = null,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // Same contract as LayoutViewer: the shape goes back through `chainTrack`, so an
  // illegal string gets the model's own objection rendered as text rather than a
  // drawing of nonsense.
  //
  // The scene is the plain track scene — the camera wanted here is the one that
  // frames the finished loop, which is exactly what `sceneFromRoute` returns.
  // Pieces therefore fly in from off the edge of the frame, which is the deal.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: sceneFromRoute(routeOf(letters)) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  let viewer = $state(null);

  // A new pace or speed is a new build; a new shape is one anyway.
  $effect(() => {
    pace; speed;
    viewer?.replay();
  });
</script>

{#if result.state === 'ok'}
  <TrackViewer
    bind:this={viewer}
    pieces={result.scene.pieces}
    camera={result.scene.camera}
    transition={{ kind: 'build', pace, speed }}
    train={{}}
    {aspect}
    {controls}
    label="The layout {letters}, building"
  />
{:else}
  <div class="viewer" style:aspect-ratio={aspect}>
    <p class="failed">
      {result.state === 'invalid'
        ? `Not a legal track: ${result.message}.`
        : 'Nothing to build yet — give it a shape string.'}
    </p>
  </div>
{/if}

<p class="caption">
  <button type="button" onclick={() => viewer?.replay()} disabled={result.state !== 'ok'}>
    Build it again
  </button>
  {#if result.state === 'ok'}
    <span class="shape">{letters}</span>
    <span class="muted">{cubesIn(result.scene.pieces)} cubes</span>
  {/if}
</p>

<style>
  .viewer {
    position: relative;
    width: 100%;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  .failed {
    margin: 0;
  }

  .caption {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>
