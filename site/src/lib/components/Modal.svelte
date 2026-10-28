<script>
	// A dialog asked of the reader over the page: the verdict on a track, the
	// challenge's briefing. A native modal `<dialog>`, so it stacks above a
	// full-screen builder in the top layer, rising into place as it opens.
	//
	// `dialog` is bound out for `showModal` and `close`; anything else a dialog takes
	// (its label, `onclose`) is passed straight through. Its heading, and its buttons
	// in an `.actions` row with the main one `.primary`, are styled here.
	let { children, dialog = $bindable(null), ...rest } = $props();
</script>

<dialog bind:this={dialog} {...rest}>
	{@render children()}
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

	dialog :global(h2) {
		margin: 0;
		font-size: 1.5rem;
	}

	dialog :global(.actions) {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	dialog :global(.actions button) {
		padding: 0.5rem 1rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	dialog :global(.actions button:disabled) {
		cursor: progress;
		opacity: 0.6;
	}

	dialog :global(.actions .primary) {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--page);
		font-weight: 600;
	}
</style>
