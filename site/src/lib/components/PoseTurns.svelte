<script>
  // The train inside one cube, turned by hand: a button per piece type, and
  // pressing one puts the train in the pose it would leave that piece in. Only
  // the pose changes — the train stays in the same cell, so what is shown is what
  // a piece does to the way the train is standing, not where it goes.
  import TrackViewer from './TrackViewer.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import { PIECES, describePose } from '$lib/catalogue.js';
  import { poseCycle, poseGhost } from '$lib/scenes.js';
  import { step } from '../../../../src/track.js';

  let { initial = 'DF', aspect = '3 / 2' } = $props();

  const scene = poseCycle();
  let pose = $state(initial);

  const turn = type => {
    pose = step([0, 0, 0], pose, type).pose;
  };
</script>

<LayoutCard footer={controls}>
  <TrackViewer
    pieces={scene.pieces}
    camera={scene.camera}
    grid={scene.grid}
    ghosts={[poseGhost(pose)]}
    {aspect}
    label="The train inside one cube, {describePose(pose)}"
  />
</LayoutCard>

{#snippet controls()}
  <p class="caption">{describePose(pose)}</p>
  <div class="keys" role="group" aria-label="Track pieces">
    {#each PIECES as { type, name, letter, hex } (type)}
      <button class="key" style="--piece: {hex}" aria-label={name} title={name} onclick={() => turn(type)}>
        {letter}
      </button>
    {/each}
  </div>
{/snippet}

<style>
  /* The builder's keys: a square per piece in its colour. Always one row of their
     own: the squares shrink before the row wraps. */
  .keys {
    display: flex;
    flex-basis: 100%;
    justify-content: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .key {
    display: grid;
    place-items: center;
    width: 44px;
    min-width: 0;
    flex-shrink: 1;
    aspect-ratio: 1;
    padding: 0;
    border: 2px solid var(--piece);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--piece);
    font-family: ui-monospace, monospace;
    font-size: 1.25rem;
    font-weight: 700;
    cursor: pointer;
  }

  .key:active {
    background: var(--piece);
    color: white;
  }
</style>
