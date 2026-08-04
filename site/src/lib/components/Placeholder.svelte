<script>
  // A visualisation that hasn't been built yet. Deliberately loud: an unfilled
  // slot should be impossible to mistake for finished page furniture.
  let { caption = '', aspect = '16 / 10' } = $props();
</script>

<figure>
  <div class="slot" style:aspect-ratio={aspect}>
    <p>Visualisation</p>
  </div>
  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>

<style>
  figure {
    margin: 2.5rem 0;
  }

  .slot {
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
    border: 2px dashed var(--rule);
    border-radius: 0.5rem;
    background: var(--wash);
  }

  .slot p {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }

  figcaption {
    margin-top: 0.75rem;
    text-align: center;
    font-size: 0.9rem;
    color: var(--muted);
  }
</style>
