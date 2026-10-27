<script>
	// The verdict on a builder's closed track. The track goes on the leaderboard the
	// moment it is offered, unnamed, and the dialog shows how it scores against the
	// crossed sweep's layouts and against the board; then it asks for a name (public)
	// and notes (only Owen reads them), and hands over to the full results.
	//
	// A native modal `<dialog>`, as `ExpandingCard`'s full screen is, so opened over a
	// full-screen builder it stacks above it in the top layer. The sweep's histogram
	// is drawn at once from the browser's score; the board's waits for the Worker,
	// which scores with the same `assess`.
	import ScoreHistogram from "./ScoreHistogram.svelte";
	import { submit, sign, standings, HISTOGRAM_FROM } from "$lib/leaderboard.js";
	import { NAME_LIMIT, NOTES_LIMIT } from "$lib/submission.js";
	import { SWEEP_CROSSED_SCORES } from "$lib/sweeps.js";

	// `shape` is the closed track's letters, `score` its score at the post's weights,
	// and `onresults` is handed the submission's id once the reader asks for the
	// full results.
	let { shape, score, onresults } = $props();

	let dialog = $state(null);
	// The track the verdict is for, so offering it again shows the same verdict.
	let judged = $state(null);
	// The Worker's answer and the board around it, once each is back.
	let sent = $state(null);
	let board = $state(null);
	let error = $state(null);
	let name = $state("");
	let notes = $state("");
	let signing = $state(false);

	// Only a track new to the board can be signed, and only once.
	const signable = $derived(Boolean(sent?.token) && !sent?.name);

	/** Opens the dialog for the track as it stands, and submits it if it is new. */
	export function offer() {
		dialog.showModal();
		if (judged === shape && !error) return;
		judged = shape;
		sent = null;
		board = null;
		name = "";
		notes = "";
		judge(shape);
	}

	async function judge(letters) {
		error = null;
		try {
			const answer = await submit(letters);
			const around = await standings(answer.id);
			if (judged !== letters) return;
			sent = answer;
			board = around;
		} catch (failure) {
			if (judged === letters) error = failure.message;
		}
	}

	// The board's scores with this track taken out, so it is judged against the rest.
	const others = $derived(
		board &&
			board.histogram
				.map(([s, n]) => [s, s === sent.score ? n - 1 : n])
				.filter(([, n]) => n > 0)
	);

	async function results(event) {
		event.preventDefault();
		if (signable) {
			signing = true;
			error = null;
			try {
				sent = { ...sent, ...(await sign(sent.id, sent.token, name, notes)) };
			} catch (failure) {
				error = failure.message;
				return;
			} finally {
				signing = false;
			}
		}
		dialog.close();
		onresults(sent.id);
	}
</script>

<dialog bind:this={dialog} aria-labelledby="verdict-title">
	<h2 id="verdict-title">It's... beautiful!</h2>
	<!-- Placeholder wording: Owen's to replace. -->
	<p class="panel">Your layout pleases the Rail Cube adjudication panel.</p>

	<section>
		<h3>vs generated layouts</h3>
		<ScoreHistogram
			counts={SWEEP_CROSSED_SCORES.counts}
			{score}
			noun="layouts"
		/>
	</section>

	<section>
		<h3>vs user-submitted layouts</h3>
		{#if board}
			<!-- Without this a track already on the board would lose its name field
			     with no word of why. -->
			{#if sent.duplicate}
				<p class="quiet">Someone got there first: this track is already on the board.</p>
			{/if}
			{#if board.total >= HISTOGRAM_FROM}
				<ScoreHistogram
					counts={others}
					score={sent.score}
					noun="other tracks"
				/>
			{/if}
		{:else if !error}
			<p class="quiet">Judging…</p>
		{/if}
	</section>

	<form onsubmit={results}>
		{#if signable}
			<label for="verdict-name"
				>Name <span>(shown on the leaderboard)</span></label
			>
			<input
				id="verdict-name"
				bind:value={name}
				maxlength={NAME_LIMIT}
				required
				autocomplete="nickname"
			/>
			<label for="verdict-notes"
				>Artist's notes <span>(optional, only Owen reads them)</span></label
			>
			<textarea
				id="verdict-notes"
				bind:value={notes}
				maxlength={NOTES_LIMIT}
				rows="3"></textarea>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="actions">
			<button type="button" onclick={() => dialog.close()}>Not now</button>
			{#if error && !sent}
				<button type="button" class="primary" onclick={() => judge(judged)}
					>Try again</button
				>
			{:else}
				<button type="submit" class="primary" disabled={!board || signing}>
					{signing ? "Signing…" : "Show full results"}
				</button>
			{/if}
		</div>
	</form>
</dialog>

<style>
	dialog {
		width: min(32rem, calc(100% - 2rem));
		max-height: calc(100% - 2rem);
		box-sizing: border-box;
		padding: 1.25rem;
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		background: var(--card-footer);
		color: var(--ink);
		opacity: 0;
		transform: translateY(var(--arrive-rise)) scale(0.96);
		transition:
			opacity 0.3s ease-out,
			transform 0.3s ease-out,
			overlay 0.3s allow-discrete,
			display 0.3s allow-discrete;
	}

	dialog[open] {
		opacity: 1;
		transform: none;
	}

	/* It rises into place as it opens, and sinks away as it closes. */
	@starting-style {
		dialog[open] {
			opacity: 0;
			transform: translateY(var(--arrive-rise)) scale(0.96);
		}
	}

	dialog::backdrop {
		background: var(--dialog-backdrop);
		opacity: 0;
		transition:
			opacity 0.3s ease-out,
			overlay 0.3s allow-discrete,
			display 0.3s allow-discrete;
	}

	dialog[open]::backdrop {
		opacity: 1;
	}

	@starting-style {
		dialog[open]::backdrop {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		dialog,
		dialog::backdrop {
			transition: none;
		}
	}

	h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.panel {
		margin: 0.25rem 0 0;
		color: var(--muted);
	}

	section {
		margin-top: 1.25rem;
	}

	h3 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
	}

	p {
		margin: 0;
	}

	.quiet {
		color: var(--muted);
	}

	form {
		margin-top: 1.25rem;
	}

	label {
		display: block;
		margin: 0.75rem 0 0.35rem;
	}

	label span {
		color: var(--muted);
		font-size: 0.85rem;
	}

	input,
	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem;
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: var(--page);
		color: inherit;
		font: inherit;
	}

	textarea {
		resize: vertical;
	}

	.error {
		margin: 0.5rem 0 0;
		color: var(--error-text);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	button {
		padding: 0.5rem 1rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	button:disabled {
		cursor: progress;
		opacity: 0.6;
	}

	.primary {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--page);
		font-weight: 600;
	}
</style>
