<script>
  import { onMount } from 'svelte';
  import { createTumbler } from '../render/tumble.js';
  import { tumbleScene, cubesIn } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    drop = 3,
    aspect = '16 / 10',
    interactive = true,
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
  let tumbler = null;
  let ready = $state(false);
  let failed = $state('');
  let released = $state(false);

  /** Stand the track back up and let go of it again. */
  function release() {
    if (!tumbler || result.state !== 'ok') return;
    const { pieces, camera, drop: height } = result.scene;
    tumbler.frameTo(camera);
    tumbler.drop(pieces, { drop: height });
    tumbler.start();
    released = true;
  }

  onMount(() => {
    let live = true;

    (async () => {
      try {
        await import('@layoutit/polycss/elements');
        await customElements.whenDefined('poly-scene');
        if (!live) return;
        tumbler = createTumbler(cameraEl, sceneEl);
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
      tumbler?.applyCamera();
    });
    ro.observe(host);

    return () => {
      live = false;
      ro.disconnect();
      tumbler?.destroy();
      tumbler = null;
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
      directional-direction="0.5,-0.7,0.6"
      directional-intensity="1"
      ambient-intensity="0.5"
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
    border-radius: 10px;
    background: radial-gradient(circle at 50% 35%, #1e293b 0%, #0f172a 70%);
    border: 1px solid var(--line);
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
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: #fca5a5;
    background: #7f1d1d55;
  }

  .caption {
    margin-top: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>
