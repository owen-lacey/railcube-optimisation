<script module>
	// How long the gate takes to fade away once pressed, in seconds.
	export const FADE = 0.4;
</script>

<script>
	// The post's ">": the only way on past a point the reader cannot scroll beyond.
	// The splash ends on one, and so does any chapter the next is held behind.
	//
	// Pressed, or sent the right arrow while it is mostly in view, it says so through
	// `onleave`, fades, and then hands over through `onopen` — at once under reduced
	// motion. Once only. Removing it is the page's business.
	//
	// It has no fade-in of its own: an animation filled `both` holds its opacity, and
	// the fade's end is read off this element's own transition.
	import { onMount } from "svelte";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { claimKeys } from "$lib/keys.js";

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

<button
	type="button"
	class:leaving
	bind:this={button}
	onclick={leave}
	ontransitionend={faded}
	aria-label={label}
	title={label}
	style:--fade="{FADE}s"
>
	<ChevronRight aria-hidden="true" />
</button>

<style>
	button {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 50%;
		background: var(--page);
		color: var(--ink);
		cursor: pointer;
	}

	.leaving {
		opacity: 0;
		transition: opacity var(--fade) ease-out;
	}
</style>
