<script>
  import '../app.css';

  let { children } = $props();
</script>

<main>
  {@render children()}
</main>

<style>
  /* The colours are the renderer's own, from lib/render/dimensions.js, so the
     post and the viewers eventually sitting in it read as one scheme. */
  main {
    --ink: #1e2530;
    --muted: #6b7382;
    --rule: #aab2bf;
    --wash: #f8fafc;

    max-width: 38rem;
    margin: 0 auto;
    padding: 4rem 1.25rem 6rem;
    color: var(--ink);
    font-family:
      ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  /* A page that opens on a splash starts at the top of the screen, so the splash
     fills the first screen exactly. So does one that opens on a scrolly section,
     which is what /post becomes once its splash is sent away. */
  main:has(> :global(:is(.splash, .scrolly):first-child)) {
    padding-top: 0;
  }

  /* While the splash is up the page is one screen tall, so its button and the right
     arrow are the only ways on. The rest is clipped rather than the page's scrolling
     turned off, which would take pull-to-refresh with it, and only downwards, so the
     splash can still reach the screen's edges. */
  main:has(> :global(.splash)) {
    height: 100svh;
    padding-bottom: 0;
    overflow: visible clip;
  }
</style>
