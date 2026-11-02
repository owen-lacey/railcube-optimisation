<script>
	// A meet figure's carousel footer: arrows at the far ends, not wrapping, and
	// "Attempt #n" between them, followed by the attempt's letters if given.
	// `children`, if given, is centred on a line of its own under them.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import PieceTag from "./PieceTag.svelte";

	// `count` is how many attempts there are, `attempt` the index up, `letters` its
	// letters, and `onturn` is called with -1 or 1.
	let { count, attempt, onturn, letters = undefined, children = undefined } = $props();
</script>

<div class="attempts" role="group" aria-label="Attempts">
	<button
		type="button"
		class="turn"
		aria-label="Previous attempt"
		disabled={attempt === 0}
		onclick={() => onturn(-1)}
	>
		<ChevronLeft />
	</button>
	<span class="candidate">
		<span class="attempt">Attempt #{attempt + 1}{letters ? ":" : ""}</span>
		{#if letters}
			<span class="tags" aria-label={letters}>
				{#each letters as letter, j (j)}<PieceTag {letter} />{/each}
			</span>
		{/if}
	</span>
	<button
		type="button"
		class="turn"
		aria-label="Next attempt"
		disabled={attempt === count - 1}
		onclick={() => onturn(1)}
	>
		<ChevronRight />
	</button>
	{#if children}
		<div class="below">{@render children()}</div>
	{/if}
</div>

<style>
	.attempts {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.5rem;
		flex-basis: 100%;
	}

	.candidate {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.below {
		grid-column: 1 / -1;
		justify-self: center;
	}

	.attempt {
		font-weight: 600;
		white-space: nowrap;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.15em;
	}

	/* As RankedTracks'. */
	.turn {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	/* As StepSection's. */
	.turn:disabled {
		opacity: 0.35;
		cursor: default;
	}
</style>
