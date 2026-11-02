<script>
	// The meet-in-the-middle's last step, one attempt at a time: loop A paired with
	// each loop B in turn, decoys first and the real one last, not wrapping. Each is
	// judged on the inventory it uses as it arrives. A figure — see `$lib/figure.js`.
	import Frame from "./Frame.svelte";
	import Attempts from "./Attempts.svelte";
	import InventorySlots from "./InventorySlots.svelte";
	import { usedOf } from "$lib/building.js";
	import { INVENTORY } from "$lib/submission.js";
	import { spendTrials, viewerShape } from "$lib/meet.svelte.js";

	// `camera` is how the tracks are shot: 'follow' frames each on its own and pans
	// between them, 'fixed' holds one shot over them all. Square on a phone, 16/10
	// otherwise, unless `aspect` is given: at 16/10 the inventory would cover a
	// phone's whole viewer.
	let { camera = "follow", aspect = undefined } = $props();
	const shape = viewerShape(() => aspect);

	const trials = $derived(spendTrials(camera));

	let attempt = $state(0);

	const view = $derived({
		shape: trials.routes[attempt],
		scene: trials.scene,
		transition: { kind: "move", pan: 0.6 }
	});
	// The pieces this track uses, and its verdict.
	const used = $derived(usedOf(view.shape));
	const spent = $derived(
		Object.keys(INVENTORY).every((type) => (used[type] ?? 0) === INVENTORY[type])
	);
</script>

{#snippet inventory()}
	<InventorySlots {used} inventory={INVENTORY} mark={spent ? "match" : "miss"} />
{/snippet}

<Frame {view} overlay={inventory} aspect={shape.value}>
	{#snippet footer()}
		<Attempts count={trials.routes.length} {attempt} onturn={(by) => (attempt += by)} />
	{/snippet}
</Frame>
