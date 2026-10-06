<script>
  // A shape looked at square on from any face of its box, turned by quarters, and
  // saved as a PNG clipped to exactly its cubes. `squareOn` in scenes.js sizes the
  // viewer to the layout's outline from there and frames it at an exact scale, so
  // the picture is the bounding box and the background is transparent.
  import Download from '@lucide/svelte/icons/download';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import TrackViewer from './TrackViewer.svelte';
  import { squareOn, VIEWS } from '$lib/scenes.js';

  let {
    shape = '',
    // CSS pixels a cube. The PNG is this times the screen's pixel ratio (at most 3).
    perCube = 60,
  } = $props();

  // Where the camera stands, one of `VIEWS`, and the picture's clockwise turn in degrees.
  let view = $state('above');
  let turn = $state(0);
  const turnBy = quarter => (turn = (turn + quarter + 360) % 360);

  const letters = $derived(shape.trim().toUpperCase());

  // Open routes are drawn as far as they go, like `Layout`: a letter is not a loop.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: squareOn(letters, { perCube: Number(perCube), view, turn }) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  let viewer = $state(null);
  const ratio = () => Math.min(globalThis.devicePixelRatio ?? 1, 3);

  async function save() {
    const blob = await viewer.snapshot();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${letters}-${view}-${turn}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="snapshot">
  <div class="actions">
    <div class="views" role="group" aria-label="Look from">
      {#each Object.keys(VIEWS) as name (name)}
        <button type="button" aria-pressed={view === name} onclick={() => (view = name)}>{name}</button>
      {/each}
    </div>
    <button type="button" class="icon" onclick={() => turnBy(-90)} aria-label="Turn anticlockwise" title="Turn anticlockwise">
      <RotateCcw aria-hidden="true" />
    </button>
    <button type="button" class="icon" onclick={() => turnBy(90)} aria-label="Turn clockwise" title="Turn clockwise">
      <RotateCw aria-hidden="true" />
    </button>
    <span>{turn}°</span>
  </div>

  {#if result.state === 'ok'}
    {@const { scene } = result}
    <div class="frame" style:width="{scene.width}px">
      <TrackViewer
        bind:this={viewer}
        pieces={scene.pieces}
        camera={scene.camera}
        alarm={scene.offender?.id ?? null}
        aspect="{scene.width} / {scene.height}"
        label="The layout {letters} from {view}"
      />
    </div>
    <div class="actions">
      <button type="button" class="icon" onclick={save} aria-label="Download PNG" title="Download PNG">
        <Download aria-hidden="true" />
      </button>
      <span>{Math.round(scene.width * ratio())} × {Math.round(scene.height * ratio())} px</span>
    </div>
  {:else if result.state === 'invalid'}
    <p>Not a legal track: {result.message}.</p>
  {:else}
    <p>Nothing to draw yet — give it a shape string.</p>
  {/if}
</div>

<style>
  .snapshot {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }

  /* Exactly the outline, never squeezed by the page. */
  .frame {
    flex: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    font-family: ui-monospace, monospace;
  }

  .views {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  /* Outlined like PlayPause and the viewer's reset. */
  button {
    height: 44px;
    padding: 0 0.75rem;
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    background: color-mix(in srgb, currentColor 18%, transparent);
    font-weight: 600;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 44px;
    padding: 0;
  }
</style>
