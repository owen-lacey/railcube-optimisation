<script>
  // The title's O come to life. The O is the post's first track looked at square on,
  // so this draws that track on a canvas over the whole screen, exactly where the
  // O's picture was, and then turns it to the post's own angle while it grows into
  // the first viewer's box. The canvas covers the screen rather than the box so the
  // track can swing past the box's edges mid-turn without being clipped. See
  // `render/zoom.js`.
  import { onMount } from 'svelte';
  import { createStage } from '../render/stage.js';
  import { readTheme } from '../render/renderer.js';
  import { trackPhase } from '../render/build.js';
  import { pinnedShot } from '../render/camera.js';
  import { endOf, shotBetween } from '../render/zoom.js';
  import { squareOn } from '$lib/scenes.js';
  import { O_TRACK, HEIGHT } from '$lib/letters.js';

  // How long the zoom takes, in seconds.
  const ZOOM = 1.4;
  const smooth = t => t * t * (3 - 2 * t);

  // `from` is the O's box on screen. `onready` is told once the O is drawn there.
  let { from, onready } = $props();

  let canvas = $state();
  let stage = null;
  let frame = 0;
  // Where the zoom starts: the O, in the box it was given at mount.
  let start = null;

  const shotAt = end => pinnedShot(end, canvas.clientWidth, canvas.clientHeight);

  /**
   * Turn and grow into `camera` drawn in `rect`, a box on screen. Resolves once
   * there, when the picture is the one a viewer that size draws from that camera.
   */
  export function zoomTo({ camera, rect }) {
    const end = endOf(camera, rect);
    const began = performance.now();
    return new Promise(resolve => {
      const tick = now => {
        const t = Math.min(1, (now - began) / (ZOOM * 1000));
        stage.frameTo(shotAt(shotBetween(start, end, smooth(t))));
        if (t < 1) frame = requestAnimationFrame(tick);
        else requestAnimationFrame(() => resolve());
      };
      frame = requestAnimationFrame(tick);
    });
  }

  onMount(() => {
    const letter = squareOn(O_TRACK.shape, { ...O_TRACK, perCube: from.height / HEIGHT });
    start = endOf(letter.camera, from);
    stage = createStage(canvas, { theme: readTheme(canvas) });
    stage.run([trackPhase(stage, letter.pieces, { drive: false })]);
    stage.frameTo(shotAt(start));
    stage.start();
    // The stage asked for its frame first, so it has drawn by the time this runs.
    frame = requestAnimationFrame(() => onready());
    return () => {
      cancelAnimationFrame(frame);
      stage.clear();
      stage = null;
    };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
  }
</style>
