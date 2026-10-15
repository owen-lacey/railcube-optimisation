<script>
	// The post's title, filling the first screen, spelled in letters built from Rail
	// Cube track. The heading is the text; the letters are a picture of it, hidden
	// from assistive technology so the title is read once rather than letter by letter.
	//
	// Every letter is sized off one length, `--cube`, so a cube is the same size in
	// every letter. The length is the largest at which the widest row fits across the
	// screen and every row fits down it.
	//
	// The title arrives a word at a time, in reading order, each dropping onto the page
	// as seen from above: large, its shadow far off, shrinking as it falls. Every
	// landing jolts the ground, the last hardest, and only once it is still does the
	// gate appear, so the O's box is never read mid-drop.
	//
	// The gate under it fades away every letter but the O with itself, and then the
	// splash hands the page, through `onnext`, the O's box on screen: the O is the
	// post's first track, and the page zooms into it from there.
	import { onMount } from "svelte";
	import Gate, { FADE } from "./Gate.svelte";
	import { GAPS, WIDTHS, HEIGHT, rowWidth, rowsHeight } from "$lib/letters.js";

	let { onnext } = $props();

	let splash = $state();
	let letters = $state();
	let leaving = $state(false);
	let landed = $state(false);

	/** Seconds before the first word sets off, a word takes to fall, and between one
	 *  word setting off and the next. */
	const DELAY = 0.8;
	const DROP = 0.6;
	const STAGGER = 0.5;
	/** A landing's jolt: how far, in cubes, and how long, in milliseconds. */
	const THUD = { size: 0.15, ms: 400 };
	const LAST_THUD = { size: 0.6, ms: 800 };

	const TEXT = "Optimising the Rail Cube";
	// Two rows on a wide screen. On a narrow one, a row that stacks puts each of its
	// words on a row of its own.
	const ROWS = [
		{ words: ["OPTIMISING", "THE"], stacks: true },
		{ words: ["RAIL", "CUBE"], stacks: false }
	];
	const WIDE = ROWS.map((row) => row.words);
	const NARROW = ROWS.flatMap((row) =>
		row.stacks ? row.words.map((word) => [word]) : [row.words]
	);

	// Each row's first word's place in reading order, so every word has one.
	const FIRST = ROWS.map((_, r) => ROWS.slice(0, r).reduce((n, row) => n + row.words.length, 0));
	const LAST = ROWS.reduce((n, row) => n + row.words.length, 0) - 1;

	const urls = import.meta.glob("../assets/letters/*.png", {
		eager: true,
		query: "?url",
		import: "default"
	});
	const src = (letter) => urls[`../assets/letters/${letter}.png`];

	const widest = (rows) => Math.max(...rows.map(rowWidth));

	onMount(() => {
		landed = matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	// A decaying jolt in the plane of the page, measured off a landed letter's cubes.
	function thud(event, order) {
		if (event.target !== event.currentTarget) return;
		const { size, ms } = order === LAST ? LAST_THUD : THUD;
		const a = (size * event.currentTarget.firstElementChild.getBoundingClientRect().height) / HEIGHT;
		const at = (x, y) => ({ translate: `${x * a}px ${y * a}px` });
		const jolt = letters.animate(
			[at(0, 0), at(0.4, 1), at(-0.6, -0.8), at(0.5, 0.5), at(-0.3, -0.3), at(0.15, 0.1), at(0, 0)],
			{ duration: ms, easing: "ease-out" }
		);
		if (order === LAST) jolt.finished.then(() => (landed = true));
	}

	function next() {
		onnext(splash.querySelector("img:not(.fades)").getBoundingClientRect());
	}
</script>

<section
	class="splash"
	class:leaving
	bind:this={splash}
	style:--fade="{FADE}s"
	style:--delay="{DELAY}s"
	style:--drop="{DROP}s"
	style:--stagger="{STAGGER}s"
	style:--letter-gap={GAPS.letter}
	style:--word-gap={GAPS.word}
	style:--row-gap={GAPS.row}
	style:--wide-across={widest(WIDE)}
	style:--wide-down={rowsHeight(WIDE.length)}
	style:--narrow-across={widest(NARROW)}
	style:--narrow-down={rowsHeight(NARROW.length)}
>
	<h1>
		<span class="text">{TEXT}</span>
		<span class="letters" aria-hidden="true" bind:this={letters}>
			{#each ROWS as row, r}
				<span class="row" class:stacks={row.stacks}>
					{#each row.words as word, w}
						<span
							class="word"
							style:--order={FIRST[r] + w}
							onanimationend={(event) => thud(event, FIRST[r] + w)}
						>
							{#each word as letter}
								<img
									class:fades={letter !== "O"}
									src={src(letter)}
									alt=""
									style:--across={WIDTHS[letter]}
									style:--down={HEIGHT}
								/>
							{/each}
						</span>
					{/each}
				</span>
			{/each}
		</span>
	</h1>
	{#if landed}
		<div class="next">
			<Gate
				label="Start reading"
				onleave={() => (leaving = true)}
				onopen={next}
			/>
		</div>
	{/if}
</section>

<style>
	/* Out of the page's column to the screen's edges, and a screen tall. */
	.splash {
		--gutter: 1.25rem;
		--fit-across: var(--wide-across);
		--fit-down: var(--wide-down);
		/* The widest the title is drawn, however wide the screen. */
		--max-across: 56rem;
		--cube: min(
			(min(100vw - 2 * var(--gutter), var(--max-across))) / var(--fit-across),
			(100svh - 2 * var(--gutter)) / var(--fit-down)
		);

		position: relative;
		box-sizing: border-box;
		width: 100vw;
		height: 100svh;
		margin-inline: calc(50% - 50vw);
		padding: var(--gutter);
		display: grid;
		place-items: center;
	}

	/* The O stays: the page takes it over. The gate fades itself, alongside. */
	.leaving .fades {
		opacity: 0;
		transition: opacity var(--fade) ease-out;
	}

	h1 {
		margin: 0;
	}

	/* Bottom centre, in the gutter under the title. */
	.next {
		position: absolute;
		bottom: var(--gutter);
		left: 50%;
		translate: -50% 0;
		animation: fade-in 0.8s ease-out both;
	}

	/* The heading's text, for assistive technology and anything else reading the
	   page rather than looking at it. */
	.text {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.letters {
		display: flex;
		flex-direction: column;
		align-items: center;
		row-gap: calc(var(--row-gap) * var(--cube));
	}

	.row {
		display: flex;
		column-gap: calc(var(--word-gap) * var(--cube));
		row-gap: calc(var(--row-gap) * var(--cube));
		align-items: center;
	}

	.word {
		display: flex;
		column-gap: calc(var(--letter-gap) * var(--cube));
		animation: drop var(--drop) cubic-bezier(0.55, 0, 1, 0.45)
			calc(var(--delay) + var(--order) * var(--stagger)) both;
	}

	/* Sized in cubes on both sides, never one side from the other, so every cube in
	   every letter comes out the same size. */
	img {
		display: block;
		width: calc(var(--across) * var(--cube));
		height: calc(var(--down) * var(--cube));
	}

	@media (max-width: 600px) {
		.splash {
			--fit-across: var(--narrow-across);
			--fit-down: var(--narrow-down);
		}

		.stacks {
			flex-direction: column;
		}
	}

	/* Falling towards the page seen from above: near the eye, so large, and high off
	   the ground, so its shadow far off and soft. Ease-in is gravity. */
	@keyframes drop {
		from {
			scale: 3;
			opacity: 0;
			filter: drop-shadow(
				calc(1.5 * var(--cube)) calc(1.5 * var(--cube)) calc(0.8 * var(--cube))
					var(--drop-shadow)
			);
		}
		30% {
			opacity: 1;
		}
		to {
			scale: 1;
			filter: drop-shadow(0 0 0 var(--drop-shadow));
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.word,
		.next {
			animation: none;
		}
	}
</style>
