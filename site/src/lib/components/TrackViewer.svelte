<script>
  import { onMount } from 'svelte';
  import { createViewer } from '../render/viewer.js';

  let {
    pieces = [],
    camera = {},
    drive = false,
    aspect = '4 / 3',
    interactive = true,
    label = '',
  } = $props();

  let host = $state(null);
  let cameraEl = $state(null);
  let sceneEl = $state(null);
  let viewer = null;
  let ready = $state(false);
  let failed = $state('');

  // PolyCSS is custom elements and touches `window`, and every page here is
  // prerendered — so none of this may run until the browser has the DOM.
  onMount(() => {
    let live = true;
    let stopObserving = () => {};

    (async () => {
      try {
        await import('@layoutit/polycss/elements');
        await customElements.whenDefined('poly-scene');
        if (!live) return;
        viewer = createViewer(cameraEl, sceneEl);
        ready = true;
        viewer.frameTo(camera);
        viewer.draw(pieces);
        if (drive) viewer.setRoute(pieces);

        // Animate only what is on screen. A page of viewers each running its own
        // rAF loop for ever is the one thing that would make this unusable on a
        // phone; a still viewer costs nothing.
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (drive && !reduced) {
          const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !document.hidden) viewer?.start();
            else viewer?.stop();
          }, { rootMargin: '100px' });
          io.observe(host);

          const onVisibility = () => {
            if (document.hidden) viewer?.stop();
          };
          document.addEventListener('visibilitychange', onVisibility);
          stopObserving = () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
          };
        }
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
      // Zoom is relative to the viewer's width, so a resize reframes.
      viewer?.applyCamera();
    });
    ro.observe(host);

    return () => {
      live = false;
      stopObserving();
      ro.disconnect();
      viewer?.destroy();
      viewer = null;
    };
  });

  // Redrawing on a new layout is what the live solve page is built on.
  $effect(() => {
    const next = pieces;
    if (!ready || !viewer) return;
    viewer.draw(next);
    if (drive) viewer.setRoute(next);
  });

  $effect(() => {
    const next = camera;
    if (!ready || !viewer) return;
    viewer.frameTo(next);
  });
</script>

<div
  class="viewer"
  class:interactive
  bind:this={host}
  style:aspect-ratio={aspect}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  <poly-camera
    bind:this={cameraEl}
    rot-x="65"
    rot-y="45"
    zoom="4"
    target="0,0,0"
  >
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
  {/if}
</div>

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

  /* Orbiting and page-scrolling fight over the same drag on a touch screen.
     Only the viewers that are meant to be handled claim the gesture; the small
     cards stay scrollable. */
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
</style>
