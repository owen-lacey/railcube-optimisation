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
	import TrackGenerator from "./TrackGenerator.svelte";
	import Optimising from "./Optimising.svelte";
	import AuthorNotes from "./AuthorNotes.svelte";
	import { tick } from "svelte";

	// The chapters between one gate and the next. The gate before a stretch scrolls
	// to its id, the first chapter's heading.
	const stretches = [
		{ id: "coordinates", chapters: [Coordinates] },
		{ id: "track-building", chapters: [TrackBuilding] },
		{ id: "track-generator", chapters: [TrackGenerator] },
		{ id: "optimising", chapters: [Optimising, AuthorNotes] },
	];

	// How many gates the reader has gone through: 0 on the splash, then one more
	// per gate. Coordinates is there under the splash too, so at least one stretch
	// is shown.
	let passed = $state(0);
	const shown = $derived(Math.max(passed, 1));
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

{#each stretches.slice(0, shown) as stretch (stretch.id)}
	{#each stretch.chapters as Section}
		<Section />
	{/each}
{/each}

<!-- Keyed, because a gate fades and opens once: the next needs a fresh one. -->
{#if shown < stretches.length}
	{#key shown}
		<div class="gate">
			<Gate label="Keep reading" onopen={() => reach(stretches[shown].id)} />
		</div>
	{/key}
{/if}

<style>
	.gate {
		display: grid;
		place-items: center;
		margin: 3.5rem 0 0;
	}
</style>
