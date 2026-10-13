<script>
	// The post, chapter by chapter. The splash is a gate: the reader is held on it
	// until they choose to go on. The opening stays mounted under it, because the
	// title zooms into its viewer.
	import Splash from "$lib/components/Splash.svelte";
	import TitleZoom from "$lib/components/TitleZoom.svelte";
	import Opening from "./Opening.svelte";
	import Coordinates from "./Coordinates.svelte";
	import TrackBuilding from "./TrackBuilding.svelte";
	import Optimising from "./Optimising.svelte";
	import AuthorNotes from "./AuthorNotes.svelte";
	import { tick } from "svelte";

	// Whether the reader has gone through the splash.
	let passed = $state(false);
	let scrolly = $state();
	// The O's box on screen while the title zooms, and the zoom.
	let zoomFrom = $state(null);
	let zoom = $state();

	const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

	async function gone() {
		passed = true;
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
</script>

<svelte:head>
	<title>Optimising the Rail Cube</title>
</svelte:head>

{#if !passed}
	<Splash onnext={open} />
{/if}

<Opening bind:scrolly />

<!-- After the opening, so its section is still the page's first child once the
     splash has gone (see the layout's padding rule). -->
{#if zoomFrom}
	<TitleZoom bind:this={zoom} from={zoomFrom} onready={zoomIn} />
{/if}

<Coordinates />
<TrackBuilding />
<Optimising />
<AuthorNotes />
