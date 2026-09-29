<script>
  // One button that starts and stops whatever a component steps through.
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';

  let { playing = $bindable(true), label = '' } = $props();

  const action = $derived(`${playing ? 'Pause' : 'Play'}${label ? ` ${label}` : ''}`);
</script>

<button type="button" class="play-pause" onclick={() => (playing = !playing)} aria-label={action} title={action}>
  {#if playing}
    <Pause fill="currentColor" aria-hidden="true" />
  {:else}
    <Play fill="currentColor" aria-hidden="true" />
  {/if}
</button>

<style>
  /* The track builder's backspace: outlined rather than filled, so it reads as an
     action rather than one more piece. */
  .play-pause {
    display: grid;
    place-items: center;
    width: 56px;
    height: 44px;
    padding: 0;
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
