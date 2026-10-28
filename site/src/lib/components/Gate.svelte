<script module>
	// How long the gate takes to fade away once pressed, in seconds.
	export const FADE = 0.4;
</script>

<script>
	// A button reading `label`: the only way on past a point the reader cannot scroll
	// beyond. The splash ends on one, reading "Start".
	//
	// Pressed, or sent the right arrow while it is mostly in view, it says so through
	// `onleave`, fades, and then hands over through `onopen` — at once under reduced
	// motion. Once only. Removing it is the page's business.
	//
	// It has no fade-in of its own: an animation filled `both` holds its opacity, and
	// the fade's end is read off this element's own transition.
	import { onMount } from "svelte";
	import { claimKeys } from "$lib/keys.js";
	import GateButton from "./GateButton.svelte";

	let { label, onleave = () => {}, onopen } = $props();

	let button = $state();
	let leaving = $state(false);
	let opened = false;

	function open() {
		if (opened) return;
		opened = true;
		onopen();
	}

	function leave() {
		if (leaving) return;
		leaving = true;
		onleave();
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) open();
	}

	function faded(event) {
		if (event.target === button && event.propertyName === "opacity") open();
	}

	onMount(() =>
		claimKeys(button, (event) => {
			if (event.key !== "ArrowRight") return;
			event.preventDefault();
			leave();
		})
	);
</script>

<GateButton
	bind:element={button}
	fading={leaving}
	onclick={leave}
	ontransitionend={faded}
	style="--fade: {FADE}s"
>
	{label}
</GateButton>
