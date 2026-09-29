<script>
  import TrackViewer from './TrackViewer.svelte';
  import { singlePiece, poseGallery } from '$lib/scenes.js';

  let {
    type,
    poses = false,
    pose = 'DF',
    scale = 1,
    aspect = poses ? '16 / 9' : '5 / 4',
    interactive = false,
    label = '',
  } = $props();

  // Neither is a track, so neither drives: the gallery is a catalogue and a
  // lone piece has no route to run along.
  const scene = $derived(poses ? poseGallery(type) : singlePiece(type, { pose, scale }));
</script>

<TrackViewer
  pieces={scene.pieces}
  camera={scene.camera}
  {aspect}
  {interactive}
  label={label || (poses ? `Every pose of the ${type} piece` : `The ${type} piece`)}
/>
