<script>
  // Two groups of pieces added together, in two steps at the press of a button:
  // drawn apart, each from the start in DF, then the second turned to carry on from
  // the first (`TrackRotate`), then its cubes carried over to the end of the first
  // (`TrackJoin`). A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import { apartScene, joinedScene } from '$lib/scenes.js';

  // `a` and `b` are the two groups, as letters; joined, they are the route `a + b`.
  let { a, b, aspect = '16 / 10' } = $props();

  // Each picture, and what the button says to leave it.
  const STEPS = [
    { state: 'apart', label: 'Rotate' },
    { state: 'turned', label: 'Join' },
    { state: 'joined', label: 'Reset' },
  ];

  let at = $state(0);
  const step = $derived(STEPS[at]);

  // Every picture framed on the one shot, so each step moves the second group and
  // nothing else.
  const scene = $derived(step.state === 'joined'
    ? joinedScene(a.length)
    : apartScene(a.length, { turned: step.state === 'turned' }));
</script>

<Frame view={{ shape: a + b, scene, transition: { kind: 'move' } }} {aspect}>
  {#snippet footer()}
    <button type="button" class="step" onclick={() => (at = (at + 1) % STEPS.length)}>
      {step.label}
    </button>
  {/snippet}
</Frame>

<style>
  /* Outlined like KnownTracks' shuffle. */
  .step {
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
