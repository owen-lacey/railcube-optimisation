<script>
	// The post, chapter by chapter. The splash is a gate: the reader is held on it
	// until they choose to go on. The opening stays mounted under it, because the
	// title zooms into its viewer. The opening is the second gate: its "All aboard!"
	// replaces it with the chapters, from the top. The last gate is Optimising's
	// challenge: a track submitted or the challenge turned down, the conclusion follows.
	import Splash from "$lib/components/Splash.svelte";
	import TitleZoom from "$lib/components/TitleZoom.svelte";
	import Opening from "./Opening.svelte";
	import Coordinates from "./Coordinates.svelte";
	import TrackMaths from "./TrackMaths.svelte";
	import Generating from "./Generating.svelte";
	import ValidTracks from "./ValidTracks.svelte";
	import Optimising from "./Optimising.svelte";
	import Conclusion from "./Conclusion.svelte";
	import { tick } from "svelte";
	import { dev } from "$app/environment";
	import { page } from "$app/state";

	// `?nointro` skips the splash and the opening, straight to the chapters, in dev only.
	const nointro = dev && page.url.searchParams.has("nointro");
	// Whether the reader has gone through the splash. `?nosplash` skips it, in dev only.
	let passed = $state(nointro || (dev && page.url.searchParams.has("nosplash")));
	// Whether the reader has gone on past the opening.
	let aboard = $state(nointro);
	// Whether the challenge is over, so the conclusion is shown.
	let concluded = $state(false);
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

	// Sent on from the splash, focus goes to the opening, as the Start button it
	// was on goes with the splash.
	async function open(rect) {
		if (!reduced()) {
			zoomFrom = rect;
			return;
		}
		await gone();
		opening.focus();
	}

	// The O is drawn live over its picture, so the splash can go from under it.
	async function zoomIn() {
		opening.hold();
		await gone();
		await zoom.zoomTo(opening.landing());
		opening.land();
		opening.focus();
		zoomFrom = null;
	}

	async function conclude() {
		concluded = true;
		await tick();
		document
			.getElementById("conclusion")
			.scrollIntoView({ behavior: reduced() ? "instant" : "smooth" });
	}

	// The chapters replace the opening, and focus goes to the first one's heading,
	// as the "All aboard!" it was on goes with the opening.
	async function board() {
		aboard = true;
		await tick();
		window.scrollTo(0, 0);
		document.getElementById("coordinates").querySelector("h2").focus({ preventScroll: true });
	}
</script>

<svelte:head>
	<title>Optimising the Rail Cube</title>
	<link rel="canonical" href="https://owenlacey.dev/railcube-optimisation/post" />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="Optimising the Rail Cube" />
	<meta property="og:url" content="https://owenlacey.dev/railcube-optimisation/post" />
	<meta property="og:image" content="https://owenlacey.dev/img/uploads/optimising-the-rail-cube/hero.png" />
	<meta property="og:image:width" content="1260" />
	<meta property="og:image:height" content="780" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Optimising the Rail Cube" />
	<meta name="twitter:image" content="https://owenlacey.dev/img/uploads/optimising-the-rail-cube/hero.png" />
</svelte:head>

{#if !passed}
	<Splash onnext={open} />
{:else}
	<!-- The splash's heading goes with it. This stays, unseen, so the page is
		 still headed; the layout's rules look past it, to the first section. -->
	<h1 class="visually-hidden">Optimising the Rail Cube</h1>
{/if}

{#if !aboard}
	<Opening bind:section={opening} onaboard={board} />
{/if}

<!-- After the opening, so its section is still the page's first child once the
     splash has gone (see the layout's padding rule). -->
{#if zoomFrom}
	<TitleZoom bind:this={zoom} from={zoomFrom} onready={zoomIn} />
{/if}

{#if aboard}
	<Coordinates />
	<TrackMaths />
	<Generating />
	<ValidTracks />
	<Optimising onconclude={conclude} />
	{#if concluded}
		<Conclusion />
	{/if}
{/if}
