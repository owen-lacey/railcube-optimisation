<script>
	// A position as a chip in a line of prose, in the reader's frame (x forwards,
	// y left, z up), written as the figures' callouts write it: a true minus
	// and a space after each comma. The same pill as `OrientationChip`, so a
	// position and an orientation side by side read as a pair.
	//
	// `at` is three coordinates, `[2, -3, -2]` → "(2, −3, −2)". `relative` is three
	// offsets from a general position, `[0, 0, 1]` → "(x, y, z + 1)". One or the other.
	import { formatPosition, formatRelative } from "$lib/catalogue.js";

	let { at = null, relative = null } = $props();

	const text = $derived.by(() => {
		if ((at === null) === (relative === null))
			throw new Error("a position chip takes `at` or `relative`, exactly one");
		return at ? formatPosition(at) : formatRelative(relative);
	});
</script>

<span class="prose-chip">{text}</span>
