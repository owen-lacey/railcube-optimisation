<script>
  // Two groups of pieces added together: drawn apart, each from the start in DF,
  // and joined at the press of a button, the second group's cubes carried over to
  // the end of the first. A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import { apartScene, joinedScene } from '$lib/scenes.js';

  // `a` and `b` are the two groups, as letters; joined, they are the route `a + b`.
  let { a, b, aspect = '16 / 10' } = $props();

  let joined = $state(false);

  // Both framed on the one shot, so joining moves the second group and nothing else.
  const scene = $derived((joined ? joinedScene : apartScene)(a.length));
</script>

<Frame view={{ shape: a + b, scene, transition: { kind: 'move' } }} {aspect}>
  {#snippet footer()}
    <button type="button" class="join" onclick={() => (joined = !joined)}>
      {joined ? 'Split' : 'Join'}
    </button>
  {/snippet}
</Frame>

<style>
  /* Outlined like KnownTracks' shuffle. */
  .join {
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
