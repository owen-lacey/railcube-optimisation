<script>
  // One orientation as `OrientationChip` pictures it, saved as a PNG: one cell from
  // the default angle, its floor marked and an arrow along the heading, on a
  // transparent background. Saved as `<orientation>.png`, for
  // `$lib/assets/orientations/`.
  import Download from '@lucide/svelte/icons/download';
  import TrackViewer from './TrackViewer.svelte';
  import { describePose } from '$lib/catalogue.js';
  import { orientationGlyph } from '$lib/scenes.js';

  let {
    orientation = 'DF',
    // CSS pixels a side. The PNG is this times the screen's pixel ratio (at most 3).
    size = 120,
  } = $props();

  const scene = $derived(orientationGlyph(orientation));

  let viewer = $state(null);
  const ratio = () => Math.min(globalThis.devicePixelRatio ?? 1, 3);

  async function save() {
    const blob = await viewer.snapshot();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${orientation}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="snapshot">
  <div class="frame" style:width="{size}px">
    <TrackViewer
      bind:this={viewer}
      pieces={scene.pieces}
      camera={scene.camera}
      grid={scene.grid}
      orientations={scene.orientations}
      aspect="1 / 1"
      label="One cell, {describePose(orientation)}"
    />
  </div>
  <div class="actions">
    <button type="button" onclick={save} aria-label="Download PNG" title="Download PNG">
      <Download aria-hidden="true" />
    </button>
    <span>{orientation}.png, {Math.round(size * ratio())} × {Math.round(size * ratio())} px</span>
  </div>
</div>

<style>
  .snapshot {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }

  /* Exactly the size asked for, never squeezed by the page. */
  .frame {
    flex: none;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: ui-monospace, monospace;
  }

  /* Outlined like Snapshot's. */
  button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
</style>
