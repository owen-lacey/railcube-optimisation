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
     fills the first screen exactly. */
  main:has(> :global(.splash:first-child)) {
    padding-top: 0;
  }
</style>
