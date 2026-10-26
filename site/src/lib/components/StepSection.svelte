<script>
	// A stretch of the post told over one viewer, a step at a time. The reader steps
	// through it with the back and forwards buttons, or the left and right arrows, and
	// each step changes what is in the box. It fills one screen: on a narrow one the
	// viewer is over the top half, the text under it and the buttons along the bottom;
	// on a wide one the section widens past the post's column, the viewer stands the
	// screen's height on the right, and the text and buttons are on the left.
	//
	// Every step's prose is laid out in the one place and only the current one shown,
	// so the text takes the tallest step's room and the buttons never move.
	//
	// A step is `{ body, figure, props }`: `body` a snippet of prose, `figure` a figure
	// component (see `$lib/figure.js`) and `props` its own — the same component, with
	// the same props, as it would be used on its own. Here it is hosted: the viewer is
	// the section's and is never remounted, a step change swaps only the figure's
	// footer, and the camera eases to the new step's frame.
	//
	// On the last step, forwards is "All aboard!": the section fades away, then calls
	// `onaboard` — at once under reduced motion. Removing it is the page's business.
	// Until then the layout holds the page to this one screen.
	import { onMount } from "svelte";
	import { Tween, prefersReducedMotion } from "svelte/motion";
	import { cubicOut } from "svelte/easing";
	import LayoutViewer from "./LayoutViewer.svelte";
	import FigureHost from "./FigureHost.svelte";
	import { layoutScene } from "$lib/scenes.js";
	import { O_TRACK } from "$lib/letters.js";
	import { claimKeys } from "$lib/keys.js";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";

	// How long the camera takes to ease to a new step's frame, in seconds.
	const PAN = 0.6;
	// The footer's height, in rem: room for the tallest a figure has, a caption over
	// a slider.
	const FOOTER = 6.5;
	// Landing, how long the card's border and dots take to fade in, and then the text,
	// in seconds.
	const SETTLE = 0.3;
	const WORDS = 0.4;

	// `transition` is how one step's picture becomes the next's, a TrackViewer kind:
	// `move` carries the cubes over while the camera pans; `steps` fades the old
	// picture out and the new one in, a group at a time, and moves only within a step.
	let { steps = [], transition = "move", onaboard } = $props();

	let active = $state(0);
	let section = $state();
	let stage = $state(null);
	let viewer = $state(null);
	let width = $state(0);
	let height = $state(0);
	// Out of sight with its train held, while the title zooms into it; then landing,
	// with the viewer showing and its border, dots and text about to fade in.
	let held = $state(false);
	let settling = $state(false);

	// Fading away, once "All aboard!" is pressed.
	let leaving = $state(false);
	/** @type {import('$lib/figure.js').FigureView | undefined} */
	let view = $state();
	// How much of the footer is showing, 0 to 1: all of it when the step's figure has
	// one, none when it does not, and easing between the two with the pan, so the bar
	// slides in and out over the card's bottom edge rather than the viewer snapping.
	const footed = new Tween(0, { easing: cubicOut });
	let shown = false;

	const Figure = $derived(steps[active].figure);
	const last = $derived(active === steps.length - 1);
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

	function back() {
		if (active > 0) active -= 1;
	}

	function forwards() {
		if (!last) active += 1;
		else if (prefersReducedMotion.current) onaboard();
		else leaving = true;
	}

	function faded(event) {
		if (event.target === section && event.propertyName === "opacity") onaboard();
	}

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
	 * The first step's camera, and the box on screen it is framed in — the part of
	 * the canvas clear of the viewer's buttons: what the zoom has to end on to be
	 * this viewer's own picture.
	 */
	export function landing() {
		if (view.shape !== O_TRACK.shape) {
			throw new Error(`the first step is ${view.shape}, not the title's O, ${O_TRACK.shape}`);
		}
		const canvas = stage.querySelector("canvas").getBoundingClientRect();
		const region = viewer.region();
		return {
			camera: (view.scene ?? layoutScene)(view.shape).camera,
			rect: {
				left: canvas.left + region.left,
				top: canvas.top + region.top,
				width: region.width,
				height: region.height
			}
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

	onMount(() =>
		claimKeys(section, (event) => {
			if (held || leaving) return;
			if (event.key === "ArrowLeft") back();
			else if (event.key === "ArrowRight") forwards();
			else return;
			event.preventDefault();
		})
	);
</script>

<section
	class="stepped"
	class:held
	class:settling
	bind:this={section}
	class:leaving
	style:--settle="{SETTLE}s"
	ontransitionend={faded}
	style:--words="{WORDS}s"
>
	<div class="stage" bind:this={stage}>
		<div
			class="box"
			class:footless={footed.target === 0}
			style:--footer-height="{FOOTER}rem"
			bind:clientWidth={width}
			bind:clientHeight={height}
		>
			<LayoutViewer
				bind:this={viewer}
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
	<div class="text">
		<div class="steps">
			{#each steps as step, i}
				<div class="step" class:current={i === active} inert={i !== active}>
					{@render step.body()}
				</div>
			{/each}
		</div>
		<nav class="nav">
			<button
				type="button"
				onclick={back}
				disabled={active === 0}
				aria-label="Back"
				title="Back"
			>
				<ChevronLeft aria-hidden="true" />
			</button>
			{#if last}
				<button type="button" class="aboard" onclick={forwards}>All aboard!</button>
			{:else}
				<button
					type="button"
					onclick={forwards}
					aria-label="Forwards"
					title="Forwards"
				>
					<ChevronRight aria-hidden="true" />
				</button>
			{/if}
		</nav>
	</div>
</section>

<style>
	/* One screen: the viewer over the top half, shrinking only when the text needs
	   more than the other half, and the buttons along the bottom. */
	.stepped {
		display: flex;
		flex-direction: column;
		height: 100svh;
	}

	.held {
	.leaving {
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--words) ease-out;
	}

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

	/* The prose, then the buttons, each faded up from a little below, as a chapter's
	   heading and then its body arrive. */
	.steps,
	.nav {
		transition:
			opacity var(--words) ease-out var(--delay),
			transform var(--words) ease-out var(--delay);
	}

	.steps {
		--delay: var(--settle);
	}

	.nav {
		--delay: calc(var(--settle) + var(--arrive-stagger));
	}

	.settling .box :global(.card) {
		border-color: transparent;
	}

	.settling .box :global(.viewer.blueprint) {
		--blueprint-dot: transparent;
		background-color: transparent;
	}

	.settling :is(.steps, .nav) {
		opacity: 0;
	}
		transform: translateY(var(--arrive-rise));

	.stage {
		flex: 0 1 50svh;
		min-height: 0;
		padding: 0.75rem 0;
		box-sizing: border-box;
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

	.text {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
	}

	/* Every step in the one cell, so the stack is the tallest step's height. */
	.steps {
		display: grid;
		padding-top: 0.75rem;
	}

	/* Hidden by opacity alone: `inert` already takes the others out of reach, and a
	   `visibility: visible` here would show through the section's while it is held. */
	.step {
		grid-area: 1 / 1;
		display: flow-root;
		opacity: 0;
		transition: opacity var(--words) ease-out;
	}

	.step.current {
		opacity: 1;
	}

	.step :global(p) {
		margin: 0 0 0.75rem;
		font-size: var(--prose-size);
		line-height: var(--prose-leading);
	}

	.nav {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 0 max(0.75rem, env(safe-area-inset-bottom));
		background: var(--page);
	}

	/* Halves of the row, outlined and rounded like the viewer's own tool buttons, and
	   filled in the border's colour while pressed, as a pressed tool is. */
	button {
		flex: 1;
		display: grid;
		place-items: center;
		height: 44px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card-footer);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
		transition: background-color 0.15s ease-out;
	}

	button:active:not(:disabled) {
		background: var(--card-border);
	}

	button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.aboard {
		font-weight: 600;
	}

	/* Side by side: the section widens past the post's column, the viewer stands the
	   screen's height on the right, and the text is centred beside it with the
	   buttons under it. */
	@media (min-width: 900px) {
		.stepped {
			--wide: min(72rem, 100vw - 2.5rem);
			margin-inline: calc((100% - var(--wide)) / 2);
			display: grid;
			grid-template-columns: minmax(0, 26rem) minmax(0, 1fr);
			gap: 2.5rem;
		}

		.stage {
			grid-area: 1 / 2;
			height: 100svh;
		}

		.text {
			grid-area: 1 / 1;
			justify-content: center;
		}

		.nav {
			position: static;
			margin-top: 1.5rem;
			padding: 0;
		}
	}
</style>
