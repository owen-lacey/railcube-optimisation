<script>
  // The first step of adding two groups of pieces: turning the second to carry on
  // from the first. Drawn apart as in `TrackSum`, the second from DF, and turned at
  // the press of a button to start in the orientation the first ends in, its callout
  // then reading the pose it ends in from there. A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import { apartScene } from '$lib/scenes.js';

  // `a` and `b` are the two groups, as letters.
  let { a, b, aspect = '16 / 10' } = $props();

  let turned = $state(false);

  // Both framed on the one shot, so turning moves the second group and nothing else.
  const scene = $derived(apartScene(a.length, { turned, states: ['apart', 'turned'] }));
</script>

<Frame view={{ shape: a + b, scene, transition: { kind: 'move' } }} {aspect}>
  {#snippet footer()}
    <button type="button" class="turn" onclick={() => (turned = !turned)}>
      {turned ? 'Reset' : 'Rotate'}
    </button>
  {/snippet}
</Frame>

<style>
  /* Outlined like KnownTracks' shuffle. */
  .turn {
    min-width: 44px;
    height: 44px;
    padding: 0 1rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
