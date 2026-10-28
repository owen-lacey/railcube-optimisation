<script>
	// The front page: the post's track builder filling the screen, to beat the score
	// with, and the leaderboard beside it as a second tab.
	//
	// The address keeps the track as `?track=`, so a reload, or a link from the
	// leaderboard, opens it where it was left; and the tab as `?tab=leaderboard`, with
	// `&id=` for the row to pick out, which is where the post's verdict sends a reader.
	//
	// The page is prerendered, so the address is read once the router is up, not at
	// render: a prerendered page has no query to read, and `replaceState` throws
	// before then. A leaderboard link to another track is a navigation too.
	//
	// The challenge's briefing opens by itself on a reader's first visit, and from
	// the header after that.
	import { onMount } from "svelte";
	import { afterNavigate, replaceState } from "$app/navigation";
	import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
	import { Tabs } from "bits-ui";
	import TrackBuilder from "$lib/components/TrackBuilder.svelte";
	import FillCard from "$lib/components/FillCard.svelte";
	import Leaderboard from "$lib/components/Leaderboard.svelte";
	import ScoreHistogram from "$lib/components/ScoreHistogram.svelte";
	import ChallengeBriefing from "$lib/components/ChallengeBriefing.svelte";
	import { standings, HISTOGRAM_FROM } from "$lib/leaderboard.js";

	// The most rows the leaderboard tab lists: the Worker's cap.
	const FULL = 100;

	// Where this browser remembers it has been briefed.
	const BRIEFED = "railcube:briefed";

	let shape = $state("");
	let letters = $state("");
	let tab = $state("builder");
	let picked = $state(null);
	let board = $state(null);
	let error = $state(null);
	let routed = $state(false);
	let briefing = $state(null);

	// Storage can be refused (a private window, blocked site data); then every
	// visit is a first.
	onMount(() => {
		let briefed = false;
		try {
			briefed = localStorage.getItem(BRIEFED) !== null;
			localStorage.setItem(BRIEFED, "1");
		} catch {}
		if (!briefed) briefing.open();
	});

	afterNavigate(({ to }) => {
		const query = to.url.searchParams;
		shape = query.get("track") ?? "";
		tab = query.get("tab") === "leaderboard" ? "leaderboard" : "builder";
		picked = query.has("id") ? Number(query.get("id")) : null;
		routed = true;
	});

	// The address follows the track, the tab and the row picked out.
	$effect(() => {
		if (!routed) return;
		const url = new URL(location.href);
		const set = (key, value) =>
			value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
		set("track", letters);
		set("tab", tab === "leaderboard" ? tab : null);
		set("id", tab === "leaderboard" && picked !== null ? String(picked) : null);
		if (url.href !== location.href) replaceState(url, {});
	});

	// The board is fetched afresh each time its tab is shown.
	$effect(() => {
		if (!routed || tab !== "leaderboard") return;
		const id = picked;
		error = null;
		standings(id, FULL)
			.then((answer) => {
				if (picked === id) board = answer;
			})
			.catch((failure) => {
				error = failure.message;
			});
	});

	function results(id) {
		picked = id;
		tab = "leaderboard";
	}
</script>

<svelte:head>
	<title>Rail Cube track builder</title>
</svelte:head>

<div class="app">
	<Tabs.Root bind:value={tab}>
		<header>
			<h1>Rail Cube track builder</h1>
			<button
				type="button"
				class="challenge"
				onclick={() => briefing.open()}
				aria-label="The challenge"
				title="The challenge"
			>
				<CircleQuestionMark aria-hidden="true" />
			</button>
			<Tabs.List>
				<Tabs.Trigger value="builder">Builder</Tabs.Trigger>
				<Tabs.Trigger value="leaderboard">Leaderboard</Tabs.Trigger>
			</Tabs.List>
		</header>
		<Tabs.Content value="builder">
			<TrackBuilder
				{shape}
				onchange={(value) => (letters = value)}
				card={FillCard}
				onresults={results}
			/>
		</Tabs.Content>
		<Tabs.Content value="leaderboard">
			<div class="board">
				{#if error}
					<p class="error" role="alert">{error}</p>
				{:else if board}
					{#if board.total >= HISTOGRAM_FROM}
						<ScoreHistogram
							counts={board.histogram}
							score={board.entry?.score ?? null}
							noun="tracks"
						/>
					{/if}
					<Leaderboard standings={board} />
				{:else}
					<p class="quiet">Fetching the leaderboard…</p>
				{/if}
			</div>
		</Tabs.Content>
	</Tabs.Root>
</div>

<ChallengeBriefing bind:this={briefing} onconfirm={() => (tab = "builder")} />

<style>
	.app {
		height: 100%;
		padding: 0.75rem;
		box-sizing: border-box;
	}

	.app :global([data-tabs-root]) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* On a phone the title takes a row, and the buttons the next. */
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-bottom: 0.75rem;
	}

	h1 {
		margin: 0;
		margin-right: auto;
		font-size: 1.25rem;
	}

	/* Outlined like the tab list beside it, and as tall. */
	.challenge {
		display: grid;
		place-items: center;
		padding: 0.35rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card-footer);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.app :global([data-tabs-list]) {
		display: flex;
		gap: 0.25rem;
		padding: 0.2rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card-footer);
	}

	.app :global([data-tabs-trigger]) {
		padding: 0.35rem 0.85rem;
		border: 0;
		border-radius: 0.35rem;
		background: transparent;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}

	.app :global([data-tabs-trigger][data-state="active"]) {
		background: var(--ink);
		color: var(--page);
		font-weight: 600;
	}

	.app :global([data-tabs-content]) {
		flex: 1;
		min-height: 0;
	}

	.app :global([data-tabs-content]:focus-visible) {
		outline: none;
	}

	.board {
		height: 100%;
		max-width: 38rem;
		margin: 0 auto;
		overflow-y: auto;
	}

	.board :global(figure) {
		margin-bottom: 1.25rem;
	}

	.error {
		color: var(--error-text);
	}

	.quiet {
		color: var(--muted);
	}
</style>
