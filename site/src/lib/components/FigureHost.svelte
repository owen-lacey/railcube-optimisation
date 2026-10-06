<script>
  // Hosts the figures inside it: each hands its view, and whether it has a footer,
  // to `show` rather than drawing it, and is given back `drawn`, the scene being
  // drawn. See `$lib/figure.js`.
  import { setContext } from 'svelte';
  import { HOST } from '$lib/figure.js';

  let { show, drawn = undefined, children } = $props();

  setContext(HOST, {
    show: (view, hasFooter) => show(view, hasFooter),
    get drawn() {
      return drawn;
    },
  });
</script>

{@render children()}
