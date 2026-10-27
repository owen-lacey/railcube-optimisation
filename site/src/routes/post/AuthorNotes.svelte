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
		Finding <b>the</b> optimal Rail Cube is easier said than done. An earlier
		version of my model used my
		<a href="https://github.com/owen-lacey/cpsat-js" target="_blank"
			>javascript port of Google's CP-SAT solver</a
		>, but I eventually learned that it was no match for this solution space,
		especially when we introduced more complex metrics like knotting.
	</p>
</Chapter>
