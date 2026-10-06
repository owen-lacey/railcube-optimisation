<script>
	// The post's title, filling the first screen, spelled in letters built from Rail
	// Cube track. The heading is the text; the letters are a picture of it, hidden
	// from assistive technology so the title is read once rather than letter by letter.
	//
	// Every letter is sized off one length, `--cube`, so a cube is the same size in
	// every letter. The length is the largest at which the widest row fits across the
	// screen and every row fits down it.
	import { GAPS, WIDTHS, HEIGHT, rowWidth, rowsHeight } from "$lib/letters.js";

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
</script>

<section
	class="splash"
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

		box-sizing: border-box;
		width: 100vw;
		height: 100svh;
		margin-inline: calc(50% - 50vw);
		padding: var(--gutter);
		display: grid;
		place-items: center;
	}

	h1 {
		margin: 0;
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
		.letters {
			animation: none;
		}
	}
</style>
