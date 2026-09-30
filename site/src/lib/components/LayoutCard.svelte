<script>
  // The frame every layout is shown in, rounded like a piece card but grey. Give it
  // a `footer` snippet and a bar for controls appears underneath; without one it is
  // only the rounded border.
  let { children, footer } = $props();
</script>

<div class="card">
  {@render children()}
  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</div>

<style>
  .card {
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 2px solid var(--card-border);
    background: var(--card-footer);
  }
</style>
