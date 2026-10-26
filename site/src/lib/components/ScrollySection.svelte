<script>
	// A stretch of the post told over one viewer. On a narrow screen the viewer stays
	// put in a box over the top half of the screen; the text runs through a band
	// reserved below it, so the two never overlap, and each paragraph changes what is
	// in the box as it arrives. The box lets go once the last step has gone under it,
	// so whatever follows the section arrives in the band and pushes the box away. On
	// a wide screen the section widens past the post's column, the box stands the
	// screen's height on the right, and the text runs past it on the left.
	//
	// A step is `{ body, figure, props }`: `body` a snippet of prose, `figure` a figure
	// component (see `$lib/figure.js`) and `props` its own — the same component, with
	// the same props, as it would be used on its own. Here it is hosted: the viewer is
	// the section's and is never remounted, a step change swaps only the figure's
	// footer, and the camera eases to the new step's frame.
	//
	// A step may also carry a `cue`, words under its prose over a bobbing chevron,
	// telling the reader to scroll on. Not a button: the reader is to scroll. It fades
	// once the page first scrolls, and stays gone.
	import { onMount } from "svelte";
	import { Tween, prefersReducedMotion } from "svelte/motion";
	import { MediaQuery } from "svelte/reactivity";
	import { cubicOut } from "svelte/easing";
	import scrollama from "scrollama";
	import LayoutViewer from "./LayoutViewer.svelte";
	import FigureHost from "./FigureHost.svelte";
	import { layoutScene } from "$lib/scenes.js";
	import { O_TRACK } from "$lib/letters.js";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";

	// How long the camera takes to ease to a new step's frame, in seconds.
	const PAN = 0.6;
	// The footer's height, in rem: room for the tallest a figure has, a caption over
	// a slider.
	const FOOTER = 6.5;
	// Landing, how long the card's border and dots take to fade in, and then the text,
	// in seconds.
	const SETTLE = 0.3;
	const WORDS = 0.4;
	// Side by side from this width up; the same breakpoint as the stylesheet's.
	const wide = new MediaQuery("min-width: 900px");

	// `transition` is how one step's picture becomes the next's, a TrackViewer kind:
	// `move` carries the cubes over while the camera pans; `steps` fades the old
	// picture out and the new one in, a group at a time, and moves only within a step.
	let { steps = [], transition = "move" } = $props();

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
	// How much of the footer is showing, 0 to 1: all of it when the step's figure has
	// one, none when it does not, and easing between the two with the pan, so the bar
	// slides in and out over the card's bottom edge rather than the viewer snapping.
	const footed = new Tween(0, { easing: cubicOut });
	let shown = false;

	const Figure = $derived(steps[active].figure);
	// The card fills the box, so it is the same size for every step; the viewer is
	// what is left of it above however much footer is showing. The card's 2px border
	// is outside both.
	const aspect = $derived.by(() => {
		if (!width || !height) return undefined;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
		return `${width - 4} / ${height - 4 - footed.current * FOOTER * rem}`;
	});

	function show(next, hasFooter) {
		view = next;
		// The first step is as it is, not slid in: the title's zoom lands on it.
		const instant = !shown || prefersReducedMotion.current;
		footed.set(hasFooter ? 1 : 0, { duration: instant ? 0 : PAN * 1000 });
		shown = true;
	}

	// The band is at least half the screen, and tall enough for the tallest step to be
	// read whole, clear of the fade: each step's prose is measured, so a narrow screen,
	// where it wraps onto more lines, takes the room from the box rather than running
	// off the bottom.
	let prose = $state([]);
	const tallest = $derived(Math.max(0, ...prose.filter(Boolean)));

	// A step is the one being read once its top is halfway down the band, or down the
	// screen when nothing is over the text. The line is in pixels, measured off the
	// stage, rather than a fraction of the viewport: a phone's address bar coming and
	// going changes the one but not the other.
	const line = () => {
		const over = wide.current ? 0 : stage.offsetHeight;
		return `${Math.round((window.innerHeight + over) / 2)}px`;
	};

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

	// Whether the page has scrolled since the section mounted, which the cue goes on.
	let scrolled = $state(false);

	// The band and the layout move the line, and scrollama has to be told.
	$effect(() => {
		tallest;
		wide.current;
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

<svelte:window onscroll={() => (scrolled ||= window.scrollY > 0)} />

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
				class:footless={footed.target === 0}
				style:--footer-height="{FOOTER}rem"
				bind:clientWidth={width}
				bind:clientHeight={height}
			>
				<LayoutViewer
					{...view}
					paused={view?.paused || held}
					{aspect}
					transition={{ kind: transition, pan: PAN, step: active }}
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
		<div class="steps">
			{#each steps as step, i}
				<div class="step" bind:this={triggers[i]}>
					<div class="prose" bind:clientHeight={prose[i]}>
						{@render step.body()}
						{#if step.cue}
							<div class="cue" class:gone={scrolled}>
								{step.cue}
								<ChevronDown aria-hidden="true" />
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
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
		/* Half the screen at most; less only when the band needs more than the other half. */
		--stage-height: min(50svh, calc(100svh - var(--band-height)));

		/* The fade goes with the box when it lets go, so whatever follows the section
		   starts clear of it rather than under it. A margin, so a heading's own larger
		   one takes its place. */
		margin-bottom: var(--fade-height);
	}

	.pinned {
		position: relative;
	}

	.held {
		visibility: hidden;
	}

	/* Settling: what the zoom did not draw — the border, the viewer's background, the
	   dots and the text — fades in as this class comes off, the text once the rest has. */
	.box :global(.card) {
		transition: border-color var(--settle) ease-out;
	}

	.box :global(.viewer.blueprint) {
		transition:
			--blueprint-dot var(--settle) ease-out,
			background-color var(--settle) ease-out;
	}

	.step {
		transition: opacity var(--words) ease-out var(--settle);
	}

	.settling .box :global(.card) {
		border-color: transparent;
	}

	.settling .box :global(.viewer.blueprint) {
		--blueprint-dot: transparent;
		background-color: transparent;
	}

	.settling .step {
		opacity: 0;
	}

	/* The box. Opaque and on top, so text that has been read goes underneath. */
	.stage {
		position: sticky;
		top: 0;
		z-index: 1;
		height: var(--stage-height);
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

	/* Exactly the box, so a footer the viewer has grown over is pushed out of the
	   bottom and clipped by the card, rather than the card growing. The viewer's room
	   is the box too, or the card's height would be a share of nothing. */
	.box :global(.room) {
		height: 100%;
	}

	.box :global(.card) {
		margin: 0;
		height: 100%;
		box-sizing: border-box;
	}

	/* Always the same height, whatever the step's figure puts in it. */
	.box :global(.footer) {
		height: var(--footer-height);
		box-sizing: border-box;
		align-content: center;
	}

	/* Full screen the viewer is laid out above the footer rather than over it, so a
	   step whose figure has none would show an empty bar. It stays mounted, hidden:
	   the figure in it is what says what to draw. */
	.box.footless :global(dialog:modal .footer) {
		display: none;
	}

	/* A paragraph being read sits clear of the fade, and fades only once it moves
     on up towards the box. */
	.step {
		min-height: max(var(--band-height), calc(100svh - var(--stage-height)));
		box-sizing: border-box;
		padding: var(--fade-height) 0 var(--step-bottom);
	}

	/* Side by side: the section widens past the post's column, the box stands the
	   screen's height on the right, and each step is centred beside it as it is read.
	   Nothing passes under the box, so there is no fade. The breakpoint is `wide`'s. */
	@media (min-width: 900px) {
		.scrolly {
			--wide: min(72rem, 100vw - 2.5rem);
			margin-inline: calc((100% - var(--wide)) / 2);
		}

		.pinned {
			display: grid;
			grid-template-columns: minmax(0, 26rem) minmax(0, 1fr);
			gap: 2.5rem;
		}

		.stage {
			grid-area: 1 / 2;
			height: 100svh;
			align-self: start;
		}

		.steps {
			grid-area: 1 / 1;
		}

		.stage::after {
			display: none;
		}

		.step {
			min-height: 100svh;
			display: flex;
			flex-direction: column;
			justify-content: center;
			padding: 0;
		}
	}

	/* Holds its paragraphs' margins, so measuring it measures them too. */
	.prose {
		display: flow-root;
	}

	.cue {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 1.5rem;
		color: var(--muted);
		font-size: 0.875rem;
		transition: opacity var(--words) ease-out;
	}

	.cue.gone {
		opacity: 0;
	}

	.cue :global(svg) {
		animation: bob 1.6s ease-in-out infinite;
	}

	@keyframes bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(0.375rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cue :global(svg) {
			animation: none;
		}
	}

	.step :global(p) {
		margin: 0 0 0.75rem;
		font-size: var(--prose-size);
		line-height: var(--prose-leading);
	}
</style>
