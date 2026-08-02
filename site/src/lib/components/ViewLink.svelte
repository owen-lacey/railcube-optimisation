<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';

  let { shape } = $props();

  const href = $derived(`${base}/view?shape=${shape}`);
  let copied = $state(false);
  let timer = null;

  async function copy() {
    // Absolute, because the point of the copy is to leave this site.
    await navigator.clipboard.writeText(new URL(href, location.origin).href);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1500);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<span class="viewlink">
  <a {href}>Open in viewer</a>
  <button type="button" onclick={copy} aria-live="polite">
    {copied ? 'Copied' : 'Copy link'}
  </button>
</span>

<style>
  .viewlink {
    display: inline-flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 0.82rem;
  }

  button {
    font-size: 0.82rem;
    padding: 0.25rem 0.6rem;
  }
</style>
