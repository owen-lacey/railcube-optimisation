<script>
  // What a builder with no pieces shows: a line over the middle of its viewer
  // pointing at the buttons below. Styled as the viewer's callouts are.
  let { text = 'Select a track piece below' } = $props();
</script>

<p class="prompt">{text}</p>

<style>
  .prompt {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    padding: 0.3em 0.7em;
    border-radius: 0.3em;
    background: color-mix(in srgb, var(--card-footer) 85%, transparent);
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
    white-space: nowrap;
    color: var(--grid-color);
    pointer-events: none;
    user-select: none;
  }
</style>
