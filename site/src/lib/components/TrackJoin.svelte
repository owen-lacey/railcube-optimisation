<script>
  // Two groups of pieces added together once the second is turned: `TrackSum` with
  // the second group already entered in the orientation the first ends in, so the
  // join at the press of a button only slides it over. A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import { apartScene, joinedScene } from '$lib/scenes.js';

  // `a` and `b` are the two groups, as letters; joined, they are the route `a + b`.
  let { a, b, aspect = '16 / 10' } = $props();

  let joined = $state(false);

  // Joined, the track has a tight shot of its own, and the camera pans to it as the
  // second group slides over, and back out as it slides away.
  const scene = $derived(joined ? joinedScene : apartScene(a.length, { turned: true, states: ['turned'] }));
</script>

<Frame view={{ shape: a + b, scene, transition: { kind: 'move', pan: 0.6 } }} {aspect}>
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
