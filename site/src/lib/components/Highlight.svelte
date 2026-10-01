<script>
  // Words in prose painted in one of the page's known colours, so the text can
  // name what a viewer draws in the colour it is drawn in. Only tokens: see colours.js.
  import { colourOf } from '$lib/colours.js';

  let { colour, children } = $props();

  const value = $derived(colourOf(colour));
</script>

<span style:--highlight={value}>{@render children()}</span>

<style>
  span {
    color: var(--highlight);
    font-weight: 600;
  }
</style>
