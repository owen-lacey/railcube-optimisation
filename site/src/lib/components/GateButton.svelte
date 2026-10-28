<script>
	// The gate's look: a button outlined and rounded like the viewer's tool buttons.
	// `Gate` is one, and so are the post's final buttons, which are not once-only.
	// `fading` fades it out over `--fade`; anything else a button takes (a click, a
	// transition handler, a style) is passed straight through.
	let { children, element = $bindable(null), fading = false, ...rest } = $props();
</script>

<button type="button" class:fading bind:this={element} {...rest}>
	{@render children()}
</button>

<style>
	button {
		display: grid;
		place-items: center;
		height: 44px;
		padding: 0 2rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card-footer);
		color: var(--ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.15s ease-out;
	}

	button:active {
		background: var(--card-border);
	}

	.fading {
		opacity: 0;
		transition: opacity var(--fade) ease-out;
	}
</style>
