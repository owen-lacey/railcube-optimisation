<script>
	// A stretch of the post told over one viewer. The viewer stays put in a box filling
	// the top of the screen; the text runs through a band of fixed height reserved
	// below it, so the two never overlap, and each paragraph changes what is in the
	// box as it arrives. The box lets go once the last step has gone under it, so
	// whatever follows the section arrives in the band and pushes the box away.
	//
	// A step is `{ body, figure, props }`: `body` a snippet of prose, `figure` a figure
	// component (see `$lib/figure.js`) and `props` its own — the same component, with
	// the same props, as it would be used on its own. Here it is hosted: the viewer is
	// the section's and is never remounted, a step change swaps only the figure's
	// footer, and the camera eases to the new step's frame.
	import { onMount } from "svelte";
	import scrollama from "scrollama";
	import LayoutViewer from "./LayoutViewer.svelte";
	import FigureHost from "./FigureHost.svelte";
	import { layoutScene } from "$lib/scenes.js";
	import { O_TRACK } from "$lib/letters.js";

	// How long the camera takes to ease to a new step's frame, in seconds.
	const PAN = 0.6;
	// The footer's height, in rem: room for the tallest a figure has, a caption over
	// a slider.
	const FOOTER = 6.5;
	// Landing, how long the card's border and dots take to fade in, and then the text,
	// in seconds.
	const SETTLE = 0.3;
	const WORDS = 0.4;

	let { steps = [] } = $props();

	let active = $state(0);
	let stage = $state(null);
	let triggers = $state([]);
	let width = $state(0);
	let height = $state(0);
	// Out of sight with its train held, while the title zooms into it; then landing,
	// with the viewer showing and its border, dots and text about to fade in.
	let held = $state(false);
	let settling = $state(false);

	/** @type {import('$lib/figure.js').FigureView | undefined} */
	let view = $state();
	// Whether the step's figure has a footer. One that does not leaves the viewer the
	// whole card.
	let footed = $state(false);

	const Figure = $derived(steps[active].figure);
	// The card fills the box, so it is the same size for every step; the viewer is
	// what is left of it under the footer, if there is one. The card's 2px border is
	// outside both.
	const aspect = $derived.by(() => {
		if (!width || !height) return undefined;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
		return `${width - 4} / ${height - 4 - (footed ? FOOTER * rem : 0)}`;
	});

	function show(next, hasFooter) {
		view = next;
		footed = hasFooter;
	}

	// The band is tall enough for the tallest step to be read whole, clear of the fade:
	// each step's prose is measured, so a narrow screen, where it wraps onto more
	// lines, takes the room from the box rather than running off the bottom.
	let prose = $state([]);
	const tallest = $derived(Math.max(0, ...prose.filter(Boolean)));

	// A step is the one being read once its top is halfway down the band. The line is
	// in pixels, measured off the stage, rather than a fraction of the viewport: a
	// phone's address bar coming and going changes the one but not the other.
	const line = () =>
		`${Math.round((window.innerHeight + stage.offsetHeight) / 2)}px`;

	// The title's O is the first step's track, and a page zooms from it into this
	// section's viewer: `hold` hides the section while it does, `landing` says what
	// the zoom is to end on, and `land` hands over.

	/**
	 * Out of sight, the train waiting at its start, and already without the border,
	 * dots and text, so that showing it does not fade them out first.
	 */
	export function hold() {
		held = true;
		settling = true;
	}

	/**
	 * The first step's camera, and the box on screen its canvas fills: what the
	 * zoom has to end on to be this viewer's own picture.
	 */
	export function landing() {
		if (view.shape !== O_TRACK.shape) {
			throw new Error(`the first step is ${view.shape}, not the title's O, ${O_TRACK.shape}`);
		}
		return {
			camera: (view.scene ?? layoutScene)(view.shape).camera,
			rect: stage.querySelector("canvas").getBoundingClientRect()
		};
	}

	/**
	 * In sight with the train let go, the picture already the zoom's last; then the
	 * card's border and dots fade in, and after them the text.
	 */
	export function land() {
		held = false;
		requestAnimationFrame(() => requestAnimationFrame(() => (settling = false)));
	}

	let scroller;

	// The band moves the line, and scrollama has to be told.
	$effect(() => {
		tallest;
		scroller?.offset(line());
	});

	onMount(() => {
		scroller = scrollama();
		scroller
			.setup({ step: triggers, offset: line() })
			.onStepEnter(({ index }) => (active = index));
		// Scrollama reads the window's height only when it builds its observers, and
		// setting the offset rebuilds them. (Its README calls this `offsetTrigger`;
		// 3.2 names it `offset`.)
		const resize = () => scroller.offset(line());
		window.addEventListener("resize", resize);
		return () => {
			window.removeEventListener("resize", resize);
			scroller.destroy();
		};
	});
</script>

<section
	class="scrolly"
	class:held
	class:settling
	style:--settle="{SETTLE}s"
	style:--words="{WORDS}s"
	style:--prose-height="{tallest}px"
>
	<!-- The box is pinned over every step, and lets go once the last has slid under
       it, so the page after the section pushes it up and away. -->
	<div class="pinned">
		<div class="stage" bind:this={stage}>
			<div
				class="box"
				class:footless={!footed}
				style:--footer-height="{FOOTER}rem"
				bind:clientWidth={width}
				bind:clientHeight={height}
			>
				<LayoutViewer
					{...view}
					paused={view?.paused || held}
					{aspect}
					transition={{ kind: "move", pan: PAN }}
				>
					{#snippet caption(drawn)}
						<FigureHost {show} {drawn}>
							<!-- Keyed, so each step's figure starts afresh. -->
							{#key active}
								<Figure {...steps[active].props} />
							{/key}
						</FigureHost>
					{/snippet}
				</LayoutViewer>
			</div>
		</div>
		{#each steps as step, i}
			<div class="step" bind:this={triggers[i]}>
				<div class="prose" bind:clientHeight={prose[i]}>
					{@render step.body()}
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	.scrolly {
		--fade-height: 3rem;
		--step-bottom: 0.5rem;
		--band-height: max(
			12rem,
			calc(var(--prose-height) + var(--fade-height) + var(--step-bottom))
		);
	}

	.pinned {
		position: relative;
	}

	.held {
		visibility: hidden;
	}

	/* Settling: what the zoom did not draw — the border, the dots and the text — fades
	   in as this class comes off, the text once the rest has. */
	.box :global(.card) {
		transition: border-color var(--settle) ease-out;
	}

	.box :global(.viewer.blueprint) {
		transition: --blueprint-dot var(--settle) ease-out;
	}

	.step {
		transition: opacity var(--words) ease-out var(--settle);
	}

	.settling .box :global(.card) {
		border-color: transparent;
	}

	.settling .box :global(.viewer.blueprint) {
		--blueprint-dot: transparent;
	}

	.settling .step {
		opacity: 0;
	}

	/* The box. Opaque and on top, so text that has been read goes underneath. */
	.stage {
		position: sticky;
		top: 0;
		z-index: 1;
		height: calc(100svh - var(--band-height));
		padding: 0.75rem 0;
		box-sizing: border-box;
		background: var(--page);
	}

	/* The fade: a strip of page colour off the bottom of the box, so a paragraph
     fades out over the top of the band before it reaches the viewer. */
	.stage::after {
		content: "";
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		height: var(--fade-height);
		background: linear-gradient(var(--page), transparent);
		pointer-events: none;
	}

	.box {
		height: 100%;
	}

	.box :global(.card) {
		margin: 0;
	}

	/* Always the same height, whatever the step's figure puts in it. */
	.box :global(.footer) {
		height: var(--footer-height);
		box-sizing: border-box;
		align-content: center;
	}

	/* A figure with no footer is still mounted in it, since it is what says what to
     draw; there is just no bar. */
	.footless :global(.footer) {
		display: none;
	}

	/* A paragraph being read sits clear of the fade, and fades only once it moves
     on up towards the box. */
	.step {
		min-height: var(--band-height);
		box-sizing: border-box;
		padding: var(--fade-height) 0 var(--step-bottom);
	}

	/* Holds its paragraphs' margins, so measuring it measures them too. */
	.prose {
		display: flow-root;
	}

	.step :global(p) {
		margin: 0 0 0.75rem;
	}
</style>
