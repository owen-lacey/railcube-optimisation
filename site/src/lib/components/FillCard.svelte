<script>
  // `ExpandingCard`'s contract without the expanding: a card that fills whatever
  // it is put in, for a page that is the builder and nothing else. There is no
  // full-screen toggle and no hand, because there is no page to scroll past it, so
  // the pane is always laid out as full screen is and always handled.
  //
  // The keys are the page's (`keys.js`), since the card fills the screen.
  import LayoutCard from './LayoutCard.svelte';

  let {
    children,
    footer = undefined,
    label,
    expanded = $bindable(true),
    handled = $bindable(true),
  } = $props();

  // Bound out as ExpandingCard binds them, and never anything else.
  expanded = true;
  handled = true;
</script>

<div class="fill" role="group" aria-label={label}>
  <LayoutCard {footer}>
    <div class="pane">
      {@render children(undefined, undefined)}
    </div>
  </LayoutCard>
</div>

<style>
  .fill {
    height: 100%;
  }

  .fill :global(.card) {
    display: flex;
    flex-direction: column;
    height: 100%;
    margin: 0;
    box-sizing: border-box;
  }

  .pane {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .pane :global(.viewer) {
    height: 100%;
  }
</style>
