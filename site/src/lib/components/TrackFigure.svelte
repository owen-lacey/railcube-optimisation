<script>
  // A track, shown for its own sake: the layout, driven, and free to be handled.
  import LayoutViewer from './LayoutViewer.svelte';

  let { shape } = $props();
</script>

<LayoutViewer {shape} />
