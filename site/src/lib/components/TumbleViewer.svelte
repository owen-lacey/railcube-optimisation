<script>
  import { onMount } from 'svelte';
  import { createStage } from '../render/stage.js';
  import { readTheme } from '../render/renderer.js';
  import { attachControls } from '../render/controls.js';
  import { tumblePhase } from '../render/tumble.js';
  import { tumbleScene, cubesIn } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    drop = 3,
    aspect = '16 / 10',
    interactive = false,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // Same contract as LayoutViewer: the shape goes back through `chainTrack`, so
  // an illegal string gets the model's objection instead of a pile of nonsense.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: tumbleScene(routeOf(letters), { drop: Number(drop) }) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  let host = $state(null);
  let canvas = $state(null);
  let stage = null;
  let ready = $state(false);
  let failed = $state('');
  let released = $state(false);

  /** Stand the track back up and let go of it again. */
  function release() {
    if (!stage || result.state !== 'ok') return;
    const { pieces, camera, drop: height } = result.scene;
    stage.clear();
    stage.frameTo(camera);
    stage.run([tumblePhase(stage, pieces, { drop: height })]);
    stage.start();
    released = true;
  }

  onMount(() => {
    let controls = null;

    try {
      stage = createStage(canvas, { theme: readTheme(host) });
      if (interactive) controls = attachControls(host, stage);
      ready = true;   // the effect below does the first drop
    } catch (error) {
      failed = error.message;
    }

    // The canvas fills the wrapper's aspect-ratio box, and zoom is relative to the
    // viewer's size, so a resize reframes (and redraws).
    const ro = new ResizeObserver(() => stage?.applyCamera());
    ro.observe(host);

    return () => {
      ro.disconnect();
      controls?.destroy();
      stage?.clear();
      stage = null;
    };
  });

  // A new shape or a new drop height is a new `result`, and a new result is a new
  // fall. This is also what does the first drop, once the stage is up.
  $effect(() => {
    if (ready && result.state === 'ok') release();
  });
</script>

<div class="viewer" class:interactive bind:this={host} style:aspect-ratio={aspect}>
  <canvas bind:this={canvas}></canvas>

  {#if failed}
    <p class="failed">Could not start the 3D view: {failed}</p>
  {:else if result.state === 'invalid'}
    <p class="failed">Not a legal track: {result.message}.</p>
  {:else if result.state === 'empty'}
    <p class="failed">Nothing to drop yet — give it a shape string.</p>
  {/if}
</div>

<p class="caption">
  <button type="button" onclick={release} disabled={!ready || result.state !== 'ok'}>
    {released ? 'Drop it again' : 'Drop it'}
  </button>
  {#if result.state === 'ok'}
    <span class="shape">{letters}</span>
    <span class="muted">{cubesIn(result.scene.pieces)} cubes · falling {drop} cubes</span>
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

  /* Orbiting and page-scrolling fight over the same drag on a touch screen. */
  .viewer.interactive {
    touch-action: none;
    cursor: grab;
  }

  .viewer.interactive:active {
    cursor: grabbing;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .failed {
    position: absolute;
    inset: auto 0 0 0;
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
