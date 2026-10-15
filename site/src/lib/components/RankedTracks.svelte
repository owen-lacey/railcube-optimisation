<script>
  // The crossed sweep's ten best or ten worst layouts under equal weights, stepped
  // through by hand, wrapping both ways. Only the position is shown: the post asks
  // which set the reader prefers before it names a single metric. The ranking is
  // `scripts/rank-tracks.js`'s, which keeps more than ten: `count` shows the first.
  // A figure — see `$lib/figure.js`.
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Frame from './Frame.svelte';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

  // `end` is 'best' or 'worst'. `train` is the viewer's: its callbacks, or null for no train.
  let { end = 'best', count = 10, ranked = SWEEP_CROSSED_RANKED, aspect = '16 / 10', train = {} } = $props();

  const tracks = $derived(ranked[end].slice(0, count));

  let index = $state(0);

  const turn = by => {
    index = (index + by + tracks.length) % tracks.length;
  };
</script>

<Frame view={{ shape: tracks[index].shape, train }} {aspect}>
  {#snippet footer()}
    <div class="ranked" role="group" aria-label="{end === 'best' ? 'Best' : 'Worst'} layouts">
      <button type="button" class="turn" aria-label="Previous {end} layout" onclick={() => turn(-1)}><ChevronLeft /></button>
      <span class="position">{index + 1} / {tracks.length}</span>
      <button type="button" class="turn" aria-label="Next {end} layout" onclick={() => turn(1)}><ChevronRight /></button>
    </div>
  {/snippet}
</Frame>

<style>
  .ranked {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Wide enough for "10 / 10", so the arrows never move. */
  .position {
    min-width: 7ch;
    text-align: center;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* As PoseCycle's. */
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
</style>
