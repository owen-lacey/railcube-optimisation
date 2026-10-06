<script>
  // What a figure draws through: the view it wants drawn and its footer. On its own
  // that is a card and a viewer of its own, which can be handled; hosted by a
  // scrolly section, the section draws the view and this is only the footer. See
  // `$lib/figure.js`.
  import { getContext } from 'svelte';
  import LayoutViewer from './LayoutViewer.svelte';
  import { HOST } from '$lib/figure.js';

  // `view` is a FigureView. `footer` is given the scene being drawn, or undefined
  // while there is none. `aspect` is the viewer's on its own; a host has its own.
  let { view, footer = undefined, aspect = '16 / 10' } = $props();

  /** @type {import('$lib/figure.js').FigureHostApi | undefined} */
  const host = getContext(HOST);

  $effect.pre(() => {
    host?.show(view, Boolean(footer));
  });
</script>

{#if host}
  {@render footer?.(host.drawn)}
{:else}
  <LayoutViewer {...view} {aspect} caption={footer}></LayoutViewer>
{/if}
