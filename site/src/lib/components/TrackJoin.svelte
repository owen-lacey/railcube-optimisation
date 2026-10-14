<script>
  // Two groups of pieces added together once the second is turned: `TrackSum` with
  // the second group already entered in the orientation the first ends in, so the
  // join at the press of a button only slides it over. A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import { apartScene, joinedScene } from '$lib/scenes.js';

  // `a` and `b` are the two groups, as letters; joined, they are the route `a + b`.
  let { a, b, aspect = '16 / 10' } = $props();

  let joined = $state(false);

  // Both framed on the one shot, so joining moves the second group and nothing else.
  const states = ['turned', 'joined'];
  const scene = $derived(joined
    ? joinedScene(a.length, { states })
    : apartScene(a.length, { turned: true, states }));
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
