<script>
  // The 24 poses: one see-through cell with the train in it, snapping from one
  // pose to the next floor by floor, in the order the model lists them, until paused.
  import TrackViewer from './TrackViewer.svelte';
  import { POSES } from '../../../../src/track.js';
  import { describePose } from '$lib/catalogue.js';
  import { poseCycle, poseGhost } from '$lib/scenes.js';
  import PlayPause from './PlayPause.svelte';

  let { interval = 1, aspect = '3 / 2' } = $props();

  const scene = poseCycle();
  let index = $state(0);
  let playing = $state(true);
  const pose = $derived(POSES[index]);

  $effect(() => {
    if (!playing) return;
    const timer = setInterval(() => { index = (index + 1) % POSES.length; }, interval * 1000);
    return () => clearInterval(timer);
  });
</script>

<figure class="pose-cycle">
  <TrackViewer
    pieces={scene.pieces}
    camera={scene.camera}
    grid={scene.grid}
    fill={scene.fill}
    ghosts={[poseGhost(pose)]}
    {aspect}
    label="The train inside one cube, in each of its 24 poses in turn"
  />
  <span class="readout position">Position {index + 1}/{POSES.length}</span>
  <span class="readout facing">{describePose(pose)}</span>
  <span class="control"><PlayPause bind:playing label="the poses" /></span>
</figure>

<style>
  .pose-cycle {
    position: relative;
    margin: 0 0 1.25rem;
  }

  .readout {
    position: absolute;
    left: 0.75rem;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    pointer-events: none;
  }

  .control {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
  }

  .position {
    top: 0.5rem;
  }

  .facing {
    bottom: 0.5rem;
  }
</style>
