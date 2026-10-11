<script>
	// The post, chapter by chapter, with a gate wherever the reader is held until
	// they choose to go on. Nothing past a closed gate is rendered, so the page ends
	// there. The splash is the first gate; the opening stays mounted under it,
	// because the title zooms into its viewer.
	import Splash from "$lib/components/Splash.svelte";
	import TitleZoom from "$lib/components/TitleZoom.svelte";
	import Gate from "$lib/components/Gate.svelte";
	import Opening from "./Opening.svelte";
	import Coordinates from "./Coordinates.svelte";
	import TrackBuilding from "./TrackBuilding.svelte";
	import Optimising from "./Optimising.svelte";
	import AuthorNotes from "./AuthorNotes.svelte";
	import { tick } from "svelte";

	// How many gates the reader has gone through: 0 on the splash, 1 reading up to
	// the end of Coordinates, 2 the rest.
	let passed = $state(0);
	let scrolly = $state();
	// The O's box on screen while the title zooms, and the zoom.
	let zoomFrom = $state(null);
	let zoom = $state();

	const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

	async function gone() {
		passed = 1;
		await tick();
		window.scrollTo(0, 0);
	}

	function open(rect) {
		if (reduced()) gone();
		else zoomFrom = rect;
	}

	// The O is drawn live over its picture, so the splash can go from under it.
	async function zoomIn() {
		scrolly.hold();
		await gone();
		await zoom.zoomTo(scrolly.landing());
		scrolly.land();
		zoomFrom = null;
	}

	// The next chapter is put in, and the page goes to its heading.
	async function reach(id) {
		passed += 1;
		await tick();
		document
			.getElementById(id)
			.scrollIntoView({ behavior: reduced() ? "instant" : "smooth" });
	}
</script>

<svelte:head>
	<title>Optimising the Rail Cube</title>
</svelte:head>

{#if passed === 0}
	<Splash onnext={open} />
{/if}

<Opening bind:scrolly />

<!-- After the opening, so its section is still the page's first child once the
     splash has gone (see the layout's padding rule). -->
{#if zoomFrom}
	<TitleZoom bind:this={zoom} from={zoomFrom} onready={zoomIn} />
{/if}

<Coordinates />

{#if passed < 2}
	<div class="gate">
		<Gate label="Keep reading" onopen={() => reach("track-building")} />
	</div>
{:else}
	<TrackBuilding />
	<Optimising />
	<AuthorNotes />
{/if}

<style>
	.gate {
		display: grid;
		place-items: center;
		margin: 3.5rem 0 0;
	}
</style>
