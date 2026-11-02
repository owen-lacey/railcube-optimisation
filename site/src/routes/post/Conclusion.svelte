<script>
	// Where the post ends, whether or not the reader took the challenge on, and the
	// way on to the builder at the front page, said one way for a reader who
	// submitted a track and another for one who did not.
	//
	// Placeholder throughout: Owen's to write. It takes in the author notes, which
	// were a chapter of their own.
	import { base } from "$app/paths";
	import Chapter from "./Chapter.svelte";

	let { submitted } = $props();
</script>

<Chapter id="conclusion">
	<h2>Conclusion</h2>
	<p>
		Admittedly, the post title mentions optimisation, but finding <b>the</b>
		optimal Rail Cube is easier said than done. An earlier version of my model used
		my
		<a href="https://github.com/owen-lacey/cpsat-js" target="_blank"
			>javascript port of Google's CP-SAT solver</a
		>, but I eventually learned that it was no match for this solution space,
		especially when we introduced more complex metrics like knotting.
	</p>
	<p>
		I hope you enjoyed reading as much as my three year old enjoys coming down
		to a freshly made Rail Cube every morning. Since you made it this far, <a
			href="mailto:hello@owenlacey.dev?subject=friend%20request&body=let%27s%20be%20mates"
			target="_blank">we should be mates</a
		>. If you made a cool track, I'd love to see it.
	</p>
	<p>
		Fear not, that wasn't your only opportunity to make a Rail Cube layout. You
		can always come back <a href="{base}/">here</a> later to build one.
	</p>
</Chapter>
