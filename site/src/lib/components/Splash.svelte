<script>
	// The post's title, filling the first screen, spelled in letters built from Rail
	// Cube track. The heading is the text; the letters are a picture of it, hidden
	// from assistive technology so the title is read once rather than letter by letter.
	//
	// Every letter is sized off one length, `--cube`, so a cube is the same size in
	// every letter. The length is the largest at which the widest row fits across the
	// screen and every row fits down it.
	//
	// The button under it, or the right arrow, fades the splash away and then tells the
	// page, through `onnext`, that it has gone.
	import { onMount } from "svelte";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { GAPS, WIDTHS, HEIGHT, rowWidth, rowsHeight } from "$lib/letters.js";
	import { claimKeys } from "$lib/keys.js";

	// How long the splash takes to fade away, in seconds.
	const FADE = 0.4;

	let { onnext } = $props();

	let splash = $state();
	let leaving = $state(false);

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

	const urls = import.meta.glob("../assets/letters/*.png", {
		eager: true,
		query: "?url",
		import: "default"
	});
	const src = (letter) => urls[`../assets/letters/${letter}.png`];

	const widest = (rows) => Math.max(...rows.map(rowWidth));

	function leave() {
		if (leaving) return;
		leaving = true;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) onnext();
	}

	function faded(event) {
		if (event.target === splash && event.propertyName === "opacity") onnext();
	}

	// The page's keys, while the splash is the most of what is on screen.
	onMount(() =>
		claimKeys(splash, (event) => {
			if (event.key !== "ArrowRight") return;
			event.preventDefault();
			leave();
		})
	);
</script>

<section
	class="splash"
	class:leaving
	bind:this={splash}
	ontransitionend={faded}
	style:--fade="{FADE}s"
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
		<span class="letters" aria-hidden="true">
			{#each ROWS as row}
				<span class="row" class:stacks={row.stacks}>
					{#each row.words as word}
						<span class="word">
							{#each word as letter}
								<img
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
	<button
		type="button"
		class="next"
		onclick={leave}
		aria-label="Start reading"
		title="Start reading"
	>
		<ChevronRight aria-hidden="true" />
	</button>
</section>

<style>
	/* Out of the page's column to the screen's edges, and a screen tall. */
	.splash {
		--gutter: 1.25rem;
		--fit-across: var(--wide-across);
		--fit-down: var(--wide-down);
		--cube: min(
			(100vw - 2 * var(--gutter)) / var(--fit-across),
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

	.leaving {
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
		animation: fade-in 0.8s ease-out both;
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

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.letters,
		.next {
			animation: none;
		}
	}
</style>
