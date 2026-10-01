<script>
  // What a piece does to the train from any pose: the train in its cell, standing
  // the way the pose control says, the piece it would ride next, and the cell and
  // pose it ends up in. Each cell is labelled with where it is — the start written
  // as (x, y, z), the end as the change from it — and the pose the train has there.
  // A press picks a piece or a pose; it never carries the train on.
  import { Tabs } from 'bits-ui';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import TrackViewer from './TrackViewer.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import { PIECES, describeDelta, describePose } from '$lib/catalogue.js';
  import { pieceMove } from '$lib/scenes.js';
  import { POSES } from '../../../../src/track.js';

  let { initial = 'DF', initialPiece = 'straight', aspect = '3 / 2' } = $props();

  // The train's cell. The camera is framed on what is drawn, backed off from
  // `pieceMove`'s tight frame by `ROOM` so there is a band above and below the
  // drawing for the callouts.
  const START = [0, 0, 0];
  const ROOM = 0.6;

  let pose = $state(initial);
  let active = $state(initialPiece);

  const piece = $derived(PIECES.find(p => p.type === active));
  const scene = $derived(pieceMove(active, { pose, cell: START }));
  const camera = $derived({ ...scene.camera, zoom: scene.camera.zoom * ROOM });
  const notes = $derived([
    { key: 'before', cell: START, lines: ['(x, y, z)', pose] },
    { key: 'after', cell: scene.after.cell, lines: [describeDelta(START, scene.after.cell), scene.after.pose] },
  ]);

  const turn = by => {
    pose = POSES[(POSES.indexOf(pose) + by + POSES.length) % POSES.length];
  };
</script>

<Tabs.Root bind:value={active} class="pose-step">
  <LayoutCard footer={keys}>
    <Tabs.Content value={active}>
      <TrackViewer
        pieces={scene.pieces}
        {camera}
        grid={scene.grid}
        ghosts={scene.ghosts}
        {notes}
        {aspect}
        label="The {piece.name.toLowerCase()} entered {describePose(pose)}, leaving the train {describePose(scene.after.pose)}"
      />
    </Tabs.Content>
  </LayoutCard>
</Tabs.Root>

{#snippet keys()}
  <div class="poses" role="group" aria-label="Start pose">
    <button class="turn" aria-label="Previous pose" onclick={() => turn(-1)}><ChevronLeft /></button>
    <p class="caption">{describePose(pose)}</p>
    <button class="turn" aria-label="Next pose" onclick={() => turn(1)}><ChevronRight /></button>
  </div>
  <Tabs.List class="keys" aria-label="Track pieces">
    {#each PIECES as { type, name, letter, hex } (type)}
      <Tabs.Trigger value={type} class="key" style="--piece: {hex}" aria-label={name} title={name}>
        {letter}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
{/snippet}

<style>
  :global(.pose-step) {
    margin: 0 0 1.25rem;
  }

  .poses {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .poses .caption {
    min-width: 16ch;
    margin: 0;
    text-align: center;
  }

  .turn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  /* The builder's keys: a square per piece in its colour, filled when selected.
     Always one row of their own: the squares shrink before the row wraps. */
  :global(.pose-step .keys) {
    display: flex;
    flex-basis: 100%;
    justify-content: center;
    gap: 0.5rem;
    min-width: 0;
  }

  :global(.pose-step .key) {
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

  :global(.pose-step .key[data-state='active']) {
    background: var(--piece);
    color: white;
  }
</style>
