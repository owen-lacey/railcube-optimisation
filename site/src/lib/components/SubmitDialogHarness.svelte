<script>
	// `SubmitDialog` for Storybook: opened on mount, and reopened by a button, over a
	// stand-in for the leaderboard Worker so each of its answers can be seen without
	// closing a loop in a builder. The stand-in scores with the Worker's own `assess`.
	//
	// `worker` is how it answers: 'board' (a board holding `others`, `[score, count]`
	// pairs, besides this track), 'judging' (never), 'unreachable' (a network
	// failure), or 'live' (the real Worker at PUBLIC_LEADERBOARD_URL, `npm run
	// worker`). `duplicate` makes the track one already on the board.
	import { onMount } from "svelte";
	import SubmitDialog from "./SubmitDialog.svelte";
	import { assess } from "$lib/submission.js";

	let { shape, others = [], duplicate = false, worker = "board", onresults } = $props();

	let verdict = $state(null);
	let score = $state(null);

	const reply = (body, status = 200) => Response.json(body, { status });

	// This track's row, ranked among `others`.
	const entryOf = (assessed) => ({
		id: 1,
		rank: 1 + others.reduce((sum, [s, n]) => sum + (s > assessed.score ? n : 0), 0),
		shape,
		name: duplicate ? "First submitter" : null,
		score: assessed.score,
		readings: assessed.readings,
	});

	// The board: `others` and this track's row.
	function boardOf(entry) {
		const counts = new Map(others);
		counts.set(entry.score, (counts.get(entry.score) ?? 0) + 1);
		const histogram = [...counts].sort(([a], [b]) => a - b);
		return {
			total: histogram.reduce((sum, [, n]) => sum + n, 0),
			top: [],
			entry,
			histogram,
		};
	}

	async function answer(url, init) {
		if (worker === "judging") return new Promise(() => {});
		if (worker === "unreachable") throw new TypeError("Failed to fetch");
		const entry = entryOf(await assess(shape));
		const { pathname } = new URL(url);
		const method = init?.method;
		if (method === "POST") {
			return reply(duplicate ? { ...entry, duplicate } : { ...entry, duplicate, token: "story" });
		}
		if (method === "PATCH") return reply({ ...entry, name: JSON.parse(init.body).name });
		if (pathname === "/leaderboard") return reply(boardOf(entry));
		return reply({ error: "not found" }, 404);
	}

	onMount(() => {
		const real = window.fetch;
		if (worker !== "live") window.fetch = answer;
		assess(shape).then((assessed) => {
			score = assessed.score;
			verdict.offer();
		});
		return () => {
			window.fetch = real;
		};
	});
</script>

<button onclick={() => verdict.offer()}>Open the verdict</button>
<SubmitDialog bind:this={verdict} {shape} {score} {onresults} />
