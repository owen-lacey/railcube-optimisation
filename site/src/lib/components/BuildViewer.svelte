<script>
  import { onMount } from 'svelte';
  import { createStage } from '../render/stage.js';
  import { readTheme } from '../render/renderer.js';
  import { attachControls } from '../render/controls.js';
  import { buildPhase, trackPhase } from '../render/build.js';
  import { sceneFromRoute, cubesIn } from '$lib/scenes.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    pace = 0.1,
    speed = 1,
    aspect = '16 / 10',
    interactive = false,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // Same contract as LayoutViewer and TumbleViewer: the shape goes back through
  // `chainTrack`, so an illegal string gets the model's own objection rendered as
  // text rather than a drawing of nonsense.
  //
  // The scene is the plain track scene — the camera Owen wants here is the one
  // that frames the finished loop, which is exactly what `sceneFromRoute` returns.
  // Pieces therefore fly in from off the edge of the frame, which is the deal.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: sceneFromRoute(routeOf(letters)) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  let host = $state(null);
  let canvas = $state(null);
  let stage = null;
  let ready = $state(false);
  let failed = $state('');
  let built = $state(false);
  let reduced = false;

  /**
   * Empty the scene and click the whole thing together again.
   *
   * Emptying first is what makes this story about a build rather than a
   * rearrangement: with nothing on the stage every piece is a *mint* and comes in
   * from off the edge of the frame. `Layout` is where pieces get picked up off the
   * floor instead.
   */
  function replay() {
    if (!stage || result.state !== 'ok') return;
    const { pieces, camera } = result.scene;
    stage.clear();
    stage.frameTo(camera);
    stage.run([reduced
      ? trackPhase(stage, pieces)
      : buildPhase(stage, pieces, { pace: Number(pace), speed: Number(speed) })]);
    stage.start();
    built = true;
  }

  onMount(() => {
    let controls = null;
    let stopObserving = () => {};

    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      stage = createStage(canvas, { theme: readTheme(host) });
      if (interactive) controls = attachControls(host, stage);
      ready = true;   // the effect below does the first build

      // Animate only what is on screen. A blog post is several of these on one
      // page, and each running its own rAF loop for ever is the one thing that
      // would make it unusable on a phone.
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !document.hidden) stage?.start();
        else stage?.stop();
      }, { rootMargin: '100px' });
      io.observe(host);

      const onVisibility = () => {
        if (document.hidden) stage?.stop();
      };
      document.addEventListener('visibilitychange', onVisibility);
      stopObserving = () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
      };
    } catch (error) {
      failed = error.message;
    }

    // The canvas fills the wrapper's aspect-ratio box, and zoom is relative to the
    // viewer's size, so a resize reframes (and redraws).
    const ro = new ResizeObserver(() => stage?.applyCamera());
    ro.observe(host);

    return () => {
      stopObserving();
      ro.disconnect();
      controls?.destroy();
      stage?.clear();
      stage = null;
    };
  });

  // A new shape or a new pace is a new build — `pace` is read inside `replay`, so
  // it is a dependency of this effect too. This is also what does the first build,
  // once the stage is up.
  $effect(() => {
    if (ready && result.state === 'ok') replay();
  });
</script>

<div class="viewer" class:interactive bind:this={host} style:aspect-ratio={aspect}>
  <canvas bind:this={canvas}></canvas>

  {#if failed}
    <p class="failed">Could not start the 3D view: {failed}</p>
  {:else if result.state === 'invalid'}
    <p class="failed">Not a legal track: {result.message}.</p>
  {:else if result.state === 'empty'}
    <p class="failed">Nothing to build yet — give it a shape string.</p>
  {/if}
</div>

<p class="caption">
  <button type="button" onclick={replay} disabled={!ready || result.state !== 'ok'}>
    {built ? 'Build it again' : 'Build it'}
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
