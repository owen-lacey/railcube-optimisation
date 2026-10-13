<script>
  // ‹ an orientation › — steps through all 24, wrapping, with the one chosen named
  // between the arrows.
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { describePose } from '$lib/catalogue.js';
  import { POSES } from '../../../../src/track.js';

  let { pose = $bindable('DF'), label = 'Start orientation' } = $props();

  const turn = by => {
    pose = POSES[(POSES.indexOf(pose) + by + POSES.length) % POSES.length];
  };
</script>

<div class="poses" role="group" aria-label={label}>
  <button class="turn" aria-label="Previous orientation" onclick={() => turn(-1)}><ChevronLeft /></button>
  <p class="caption">{describePose(pose)}</p>
  <button class="turn" aria-label="Next orientation" onclick={() => turn(1)}><ChevronRight /></button>
</div>

<style>
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
</style>
