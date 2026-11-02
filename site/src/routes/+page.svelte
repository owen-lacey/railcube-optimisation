<script>
	// The front page: the post's track builder filling the screen, to beat the score
	// with, and the leaderboard beside it as a second tab.
	//
	// The address keeps the track as `?track=`, so a reload, or a link from the
	// leaderboard, opens it where it was left. A leaderboard link adds `&view`, which
	// opens the track read-only until the reader starts one of their own: otherwise a
	// listed track could be re-closed and submitted as theirs. The tab is `?tab=leaderboard`, with
	// `&id=` for the row to pick out, which is where the post's verdict sends a reader.
	//
	// The page is prerendered, so the address is read once the router is up, not at
	// render: a prerendered page has no query to read, and `replaceState` throws
	// before then. A leaderboard link to another track is a navigation too.
	//
	// The leaderboard has two lists: the readers' submissions, from the Worker, and
	// the model's own best thousand, from a file loaded the first time it is shown.
	// `&list=model` keeps the second; `&id=` is a submission, so it opens the first.
	//
	// The challenge's briefing opens by itself on a reader's first visit, and from
	// the header after that.
	import { onMount } from "svelte";
	import { afterNavigate, replaceState } from "$app/navigation";
	import { Icon } from "@lucide/svelte";
	import { Tabs } from "bits-ui";
	import TrackBuilder from "$lib/components/TrackBuilder.svelte";
	import FillCard from "$lib/components/FillCard.svelte";
	import Leaderboard from "$lib/components/Leaderboard.svelte";
	import ScoreHistogram from "$lib/components/ScoreHistogram.svelte";
	import ChallengeBriefing from "$lib/components/ChallengeBriefing.svelte";
	import { standings, HISTOGRAM_FROM } from "$lib/leaderboard.js";
	import { rankRows } from "$lib/ranks.js";

	// The most rows the leaderboard tab lists: the Worker's cap.
	const FULL = 100;

	// Where this browser remembers it has been briefed.
	const BRIEFED = "railcube:briefed";

	// Lucide has no bare question mark: circle-question-mark's strokes, without
	// the circle, scaled 1.25× about the middle so it fills the button.
	/** @type {import("@lucide/svelte").LucideIconData} */
	const QUESTION_MARK = {
		name: "question-mark",
		node: [
			["path", { d: "M8.36 8.25a3.75 3.75 0 0 1 7.29 1.25c0 2.5-3.75 3.75-3.75 3.75" }],
			["path", { d: "M12 18.25h.01" }],
		],
	};

	let shape = $state("");
	let letters = $state("");
	let viewing = $state(false);
	let tab = $state("builder");
	let list = $state("submissions");
	let picked = $state(null);
	let board = $state(null);
	let error = $state(null);
	let model = $state(null);
	let modelError = $state(null);
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
		viewing = query.has("view");
		tab = query.get("tab") === "leaderboard" ? "leaderboard" : "builder";
		picked = query.has("id") ? Number(query.get("id")) : null;
		list = query.get("list") === "model" && picked === null ? "model" : "submissions";
		routed = true;
	});

	// The address follows the track, the tab and the row picked out.
	$effect(() => {
		if (!routed) return;
		const url = new URL(location.href);
		const set = (key, value) =>
			value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
		set("track", letters);
		set("view", viewing ? "1" : null);
		set("tab", tab === "leaderboard" ? tab : null);
		const shown = tab === "leaderboard" ? list : null;
		set("list", shown === "model" ? shown : null);
		set("id", shown === "submissions" && picked !== null ? String(picked) : null);
		if (url.href !== location.href) replaceState(url, {});
	});

	// The submissions are fetched afresh each time their list is shown.
	$effect(() => {
		if (!routed || tab !== "leaderboard" || list !== "submissions") return;
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

	// The model's list is fixed, so it is loaded once.
	$effect(() => {
		if (!routed || tab !== "leaderboard" || list !== "model" || model) return;
		modelError = null;
		import("$lib/data/sweep-crossed-top.json")
			.then(({ default: top }) => {
				model = { legal: top.legal, rows: rankRows(top.best) };
			})
			.catch((failure) => {
				modelError = failure.message;
			});
	});

	function unlock() {
		viewing = false;
		shape = "";
	}

	function results(id) {
		picked = id;
		list = "submissions";
		tab = "leaderboard";
	}

	const count = (n) => n.toLocaleString("en-GB");
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
				<Icon icon={QUESTION_MARK} aria-hidden="true" />
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
				onunlock={viewing ? unlock : undefined}
			/>
		</Tabs.Content>
		<Tabs.Content value="leaderboard">
			<div class="board">
				<Tabs.Root bind:value={list}>
					<Tabs.List>
						<Tabs.Trigger value="submissions">Submissions</Tabs.Trigger>
						<Tabs.Trigger value="model">Model</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="submissions">
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
							<Leaderboard
								rows={board.top}
								entry={board.entry}
								caption="{count(board.total)} {board.total === 1 ? 'track' : 'tracks'} submitted"
							/>
						{:else}
							<p class="quiet">Fetching the leaderboard…</p>
						{/if}
					</Tabs.Content>
					<Tabs.Content value="model">
						{#if modelError}
							<p class="error" role="alert">{modelError}</p>
						{:else if model}
							<Leaderboard
								rows={model.rows}
								entry={null}
								caption="The model's top {count(model.rows.length)} of {count(model.legal)} solved layouts"
							/>
						{:else}
							<p class="quiet">Loading the model's layouts…</p>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
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

	/* A panel takes focus from its tab; drawn inside it, which the page would clip. */
	.app :global([data-tabs-content]:focus-visible) {
		outline: 2px solid var(--grid-color);
		outline-offset: -2px;
		border-radius: 0.5rem;
	}

	.board {
		height: 100%;
		max-width: 38rem;
		margin: 0 auto;
		overflow-y: auto;
	}

	/* The lists' tabs: a block in the board, not the page's full-height column. */
	.board :global([data-tabs-root]) {
		height: auto;
	}

	.board :global([data-tabs-list]) {
		width: fit-content;
		margin-bottom: 0.75rem;
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
