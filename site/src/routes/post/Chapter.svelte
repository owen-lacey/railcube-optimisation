<script>
	// A chapter of the post: a section, under its own heading, and the post's prose
	// typography for whatever the chapter writes directly. Prose inside a figure or a
	// scrolly section's steps is styled where it is laid out.
	let { id, children } = $props();
</script>

<section class="chapter" {id}>
	{@render children()}
</section>

<style>
	.chapter > :global(h2) {
		font-size: 1.4rem;
		line-height: 1.2;
		margin: 3.5rem 0 1.25rem;
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
