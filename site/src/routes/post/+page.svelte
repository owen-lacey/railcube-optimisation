<script>
	// The post, chapter by chapter. The splash is a gate: the reader is held on it
	// until they choose to go on. The opening stays mounted under it, because the
	// title zooms into its viewer. The opening is the second gate: the chapters are
	// only there once its "All aboard!" is pressed.
	import Splash from "$lib/components/Splash.svelte";
	import TitleZoom from "$lib/components/TitleZoom.svelte";
	import Opening from "./Opening.svelte";
	import Coordinates from "./Coordinates.svelte";
	import TrackBuilding from "./TrackBuilding.svelte";
	import Optimising from "./Optimising.svelte";
	import AuthorNotes from "./AuthorNotes.svelte";
	import { tick } from "svelte";
	import { dev } from "$app/environment";
	import { page } from "$app/state";

	// Whether the reader has gone through the splash. `?nosplash` skips it, in dev only.
	let passed = $state(dev && page.url.searchParams.has("nosplash"));
	// Whether the reader has gone on past the opening.
	let aboard = $state(false);
	let opening = $state();
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
		opening.hold();
		await gone();
		await zoom.zoomTo(opening.landing());
		opening.land();
		zoomFrom = null;
	}

	async function board() {
		aboard = true;
		await tick();
		document
			.getElementById("coordinates")
			.scrollIntoView({ behavior: reduced() ? "instant" : "smooth" });
	}
</script>

<svelte:head>
	<title>Optimising the Rail Cube</title>
</svelte:head>

{#if !passed}
	<Splash onnext={open} />
{/if}

<Opening bind:section={opening} locked={!aboard} onaboard={board} />

<!-- After the opening, so its section is still the page's first child once the
     splash has gone (see the layout's padding rule). -->
{#if zoomFrom}
	<TitleZoom bind:this={zoom} from={zoomFrom} onready={zoomIn} />
{/if}

{#if aboard}
	<Coordinates />
	<TrackBuilding />
	<Optimising />
	<AuthorNotes />
{/if}
