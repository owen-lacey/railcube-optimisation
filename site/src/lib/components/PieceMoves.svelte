<script>
  // What each piece does to the train: a piece on its own, with a ghost train
  // where the train rides before it and another where it rides after, and a
  // button per piece type under it. Nothing moves — it is a picture of one step.
  import { Tabs } from 'bits-ui';
  import TrackViewer from './TrackViewer.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import { PIECES, describeMove } from '$lib/catalogue.js';
  import { pieceMove } from '$lib/scenes.js';

  let { initial = 'straight', aspect = '3 / 2' } = $props();

  let active = $state(initial);

  const piece = $derived(PIECES.find(p => p.type === active));
  const scene = $derived(pieceMove(active));
</script>

<Tabs.Root bind:value={active} class="piece-moves">
  <LayoutCard footer={keys}>
    <!-- One panel whose value follows the tab, so there is one viewer and a tab
         change redraws it rather than mounting another. -->
    <Tabs.Content value={active}>
      <TrackViewer
        pieces={scene.pieces}
        camera={scene.camera}
        grid={scene.grid}
        ghosts={scene.ghosts}
        {aspect}
        label="The {piece.name.toLowerCase()}, with the train before and after it"
      />
    </Tabs.Content>
  </LayoutCard>
</Tabs.Root>

{#snippet keys()}
  <p class="caption">{describeMove(active)}</p>
  <p class="legend">
    <span class="swatch before"></span>before
    <span class="swatch after"></span>after
  </p>
  <Tabs.List class="keys" aria-label="Track pieces">
    {#each PIECES as { type, name, letter, hex } (type)}
      <Tabs.Trigger value={type} class="key" style="--piece: {hex}" aria-label={name} title={name}>
        {letter}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
{/snippet}

<style>
  :global(.piece-moves) {
    margin: 0 0 1.25rem;
  }

  /* The builder's keys: a square per piece in its colour, filled when selected. */
  :global(.piece-moves .keys) {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  :global(.piece-moves .key) {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
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

  :global(.piece-moves .key[data-state='active']) {
    background: var(--piece);
    color: white;
  }

  .caption {
    margin: 0;
    font-weight: 600;
  }

  .legend {
    margin: 0;
    font-size: 0.85rem;
  }

  .swatch {
    display: inline-block;
    width: 0.75em;
    height: 0.75em;
    margin: 0 0.3em 0 0.8em;
    border-radius: 0.2em;
    vertical-align: -0.05em;
    opacity: var(--ghost-opacity);
  }

  .swatch.before {
    background: var(--ghost-before);
  }

  .swatch.after {
    background: var(--ghost-after);
  }
</style>
