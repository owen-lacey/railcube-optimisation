<script>
  import '../app.css';

  let { children } = $props();
</script>

<main>
  {@render children()}
</main>

<style>
  /* The colours are app.css's tokens. */
  main {
    /* The post's running text, wherever it is laid out. */
    --prose-size: 1.0625rem;
    --prose-leading: 1.65;

    max-width: 38rem;
    margin: 0 auto;
    padding: 4rem 1.25rem 6rem;
    color: var(--ink);
    font-family:
      ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  /* A page that opens on a splash starts at the top of the screen, so the splash
     fills the first screen exactly. So does one that opens on a stepped section,
     which is what /post becomes once its splash is sent away. The first section,
     not the first child: an unseen heading may come before it. */
  main:has(> :global(:is(.splash, .stepped):first-of-type)) {
    padding-top: 0;
  }

  /* A page that is an app, such as the front page's builder, fills the screen
     edge to edge rather than sitting in the post's column. */
  main:has(> :global(.app)) {
    max-width: none;
    height: 100svh;
    padding: 0;
  }

  /* While the splash or a stepped section is up the page is one screen tall, so
     its buttons and the arrows are the only ways on. The rest is clipped rather
     than the page's scrolling turned off, which would take pull-to-refresh with
     it, and only downwards, so the splash can still reach the screen's edges.
     Positioned, so anything absolute inside it, such as a section's unseen
     announcer, is placed against it and clipped too, rather than lengthening
     the page from outside the clip. */
  main:has(> :global(:is(.splash, .stepped))) {
    position: relative;
    height: 100svh;
    padding-bottom: 0;
    overflow: visible clip;
  }
</style>
