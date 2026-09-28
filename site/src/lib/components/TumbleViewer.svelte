<script>
  import { onMount } from 'svelte';
  import { createStage } from '../render/stage.js';
  import { tumblePhase } from '../render/tumble.js';
  import { LIGHT } from '../render/dimensions.js';
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
  let cameraEl = $state(null);
  let sceneEl = $state(null);
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
    let live = true;

    (async () => {
      try {
        await import('@layoutit/polycss/elements');
        await customElements.whenDefined('poly-scene');
        if (!live) return;
        stage = createStage(cameraEl, sceneEl);
        ready = true;   // the effect below does the first drop
      } catch (error) {
        failed = error.message;
      }
    })();

    // PolyCSS needs real pixel dimensions on the camera element — the wrapper's
    // aspect-ratio box does the layout, this copies its size across.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!cameraEl || !width) return;
      cameraEl.style.width = `${Math.round(width)}px`;
      cameraEl.style.height = `${Math.round(height)}px`;
      stage?.applyCamera();
    });
    ro.observe(host);

    return () => {
      live = false;
      ro.disconnect();
      stage?.clear();
      stage = null;
    };
  });

  // A new shape or a new drop height is a new `result`, and a new result is a new
  // fall. This is also what does the first drop, once PolyCSS is up.
  $effect(() => {
    if (ready && result.state === 'ok') release();
  });
</script>

<div class="viewer" class:interactive bind:this={host} style:aspect-ratio={aspect}>
  <poly-camera bind:this={cameraEl} rot-x="65" rot-y="45" zoom="4" target="0,0,0">
    <poly-scene
      bind:this={sceneEl}
      directional-direction={LIGHT.direction}
      directional-intensity={LIGHT.directional}
      ambient-intensity={LIGHT.ambient}
    >
      {#if interactive}
        <poly-orbit-controls drag wheel></poly-orbit-controls>
      {/if}
    </poly-scene>
  </poly-camera>

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
  .viewer.interactive :global(poly-camera) {
    touch-action: none;
  }

  .viewer :global(poly-camera) {
    display: block;
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
