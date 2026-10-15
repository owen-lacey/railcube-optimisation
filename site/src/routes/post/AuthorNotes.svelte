<script>
	// What the post leaves open.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Chapter from "./Chapter.svelte";
</script>

<Chapter id="author-notes">
	<hr />

	<h2>Author notes</h2>
	<p>
		I estimate that there are over <a
			href="https://bsky.app/profile/owenlacey.dev/post/3mwlhlqenlc2r"
			target="_blank">28 billion different ways</a
		> to build a valid Rail Cube track, using every piece. My program generated around
		10 million - about 0.04% of the total. As such, I'm fairly confident that there
		are layouts that score higher than the ones you've seen.
	</p>

	<p>
		Finding <b>the</b> optimal Rail Cube is therefore easier said than done. An
		earlier version of my model used my
		<a href="https://github.com/owen-lacey/cpsat-js" target="_blank"
			>javascript port of Google's CP-SAT solver</a
		>, but I eventually learned that it was no match for this solution space,
		especially when we introduced more complex metrics like knotting.
	</p>
</Chapter>
