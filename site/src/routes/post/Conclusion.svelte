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
	<hr />

	<h2>Conclusion</h2>
	<p>[Placeholder: the conclusion.]</p>
	<p>
		Finding <b>the</b> optimal Rail Cube is easier said than done. An earlier
		version of my model used my
		<a href="https://github.com/owen-lacey/cpsat-js" target="_blank"
			>javascript port of Google's CP-SAT solver</a
		>, but I eventually learned that it was no match for this solution space,
		especially when we introduced more complex metrics like knotting.
	</p>
	<!-- The old sign-off, for the conclusion's sentiment:
		I'll leave you with my poor attempt of recreating RollerCoaster Tycoon. If
		you've made it this far, <a
			href="mailto:hello@owenlacey.dev?subject=friend%20request&body=let%27s%20be%20mates"
			target="_blank">we should be mates</a
		>. If you make a cool track, I'd love to see it. Happy optimising! -->
	{#if submitted}
		<p>
			[Placeholder: for a reader who submitted a track.]
			<a href="{base}/">See the leaderboard</a>
		</p>
	{:else}
		<p>
			[Placeholder: for a reader who didn't.]
			<a href="{base}/">Build a track</a>
		</p>
	{/if}
</Chapter>
