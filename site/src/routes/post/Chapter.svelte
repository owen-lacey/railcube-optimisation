<script>
	// A chapter of the post: a section, under its own heading, and the post's prose
	// typography for whatever the chapter writes directly. Prose inside a figure or a
	// stepped section's steps is styled where it is laid out.
	let { id, children } = $props();
</script>

<section class="chapter" {id}>
	{@render children()}
</section>

<style>
	/* The chapters arrive together, in place of the opening, a block at a time: the
	   heading, then the next two blocks one after another, then the rest. Each is
	   faded up from a little below, and filled backwards only, so no transform is
	   left on it once it has landed to box in anything fixed inside it. */
	.chapter > :global(*) {
		--step: 3;
		animation: arrive 0.6s ease-out calc(var(--step) * var(--arrive-stagger)) backwards;
	}

	.chapter > :global(:nth-child(1)) {
		--step: 0;
	}

	.chapter > :global(:nth-child(2)) {
		--step: 1;
	}

	.chapter > :global(:nth-child(3)) {
		--step: 2;
	}

	@keyframes -global-arrive {
		from {
			opacity: 0;
			transform: translateY(var(--arrive-rise));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chapter > :global(*) {
			animation: none;
		}
	}

	.chapter > :global(hr) {
		margin: 5rem 0 0;
	}

	.chapter > :global(h2) {
		font-size: 1.4rem;
		line-height: 1.2;
		margin: 3.5rem 0 1.25rem;
	}

	/* The page's first chapter starts under the layout's own top padding alone: the
	   heading's margin is room from a chapter before it, and there is none. */
	.chapter:first-child > :global(h2:first-child) {
		margin-top: 0;
	}

	.chapter > :global(:is(p, ul)) {
		font-size: var(--prose-size);
		line-height: var(--prose-leading);
		margin: 0 0 1.25rem;
	}

	.chapter > :global(ul) {
		padding-left: 1.25rem;
	}

	.chapter > :global(ul > li) {
		margin-bottom: 0.375rem;
	}
</style>
