<script>
  import TrackViewer from './TrackViewer.svelte';
  import { openScene, frame } from '$lib/scenes.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // Off, a shape change is an instant redraw framed tight on that layout —
    // the trade the front page makes on a phone, where the fixed frame's empty
    // room costs more scale than the rearrangement is worth.
    sequence = true,
    drive = true,
    interactive = true,
    pace = 0.04,
    speed = 1.2,
    handover = 0.5,
    drop = 2,
    // How far the fixed frame reaches — the box the shapes were solved in. Unset
    // means the JS solver's own constraint; see `fixedFrame` in scenes.js.
    reach = undefined,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // The shape is re-derived through `chainOpen`, which reports rather than
  // refuses: an unfinished or stuck route is drawn as far as it goes, with a
  // piece that has nowhere to go flashing red where it was asked to land.
  // `routeOf` still throws on a letter outside the six piece types, which is
  // the one thing left that blanks the viewer.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      const { pieces, closed, offender } = openScene(letters);
      return { state: 'ok', pieces, closed, offender, camera: frame(pieces) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });
</script>

{#if result.state === 'ok'}
  <TrackViewer
    pieces={result.pieces}
    camera={result.camera}
    drive={drive && result.closed}
    {sequence}
    {pace}
    {speed}
    {handover}
    {drop}
    {reach}
    {aspect}
    {interactive}
    label="The layout {letters}"
  />
  <p class="caption">
    <span class="shape">{letters}</span>
    <span class="muted">
      {cubesIn(result.pieces)} cubes · {scoreOf(result.pieces)} pts
      {#if result.offender}
        · stuck: {result.offender.message}
      {:else if !result.closed}
        · open
      {/if}
    </span>
  </p>
{:else}
  <div class="empty" style:aspect-ratio={aspect}>
    {#if result.state === 'invalid'}
      <p class="failed">Not a legal track: {result.message}.</p>
      <p class="shape">{letters}</p>
    {:else}
      <p>Nothing to draw yet — give it a shape string.</p>
    {/if}
  </div>
{/if}

<style>
  .empty {
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
  }

  .empty p {
    margin: 0;
  }

  .caption {
    text-align: center;
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>
