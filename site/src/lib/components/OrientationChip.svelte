<script>
	// An orientation as a chip in a line of prose: its two axes, "−z +y", with a
	// picture of it and the orientation in words as its tooltip. The pictures are
	// saved from the `Orientation snapshot` story, one per orientation.
	//
	// The tooltip opens as `PoseChip`'s does: on hover and keyboard focus, and on a
	// tap, which toggles it; a tap anywhere else, a scroll or Escape closes it. It
	// brings its own `Tooltip.Provider`, since prose has none above it.
	import { Tooltip } from "bits-ui";
	import { describePose, poseLabel } from "$lib/catalogue.js";

	const GLYPHS = import.meta.glob("../assets/orientations/*.png", {
		eager: true,
		import: "default"
	});

	// `orientation` is a code like `'DF'`: floor, then heading.
	let { orientation } = $props();

	const name = $derived(describePose(orientation));
	const glyph = $derived.by(() => {
		const src = GLYPHS[`../assets/orientations/${orientation}.png`];
		if (!src) throw new Error(`no picture saved for the orientation ${orientation}`);
		return src;
	});

	let open = $state(false);
	// Read on the way down, as in `PoseChip`: by the click it is too late to ask.
	let tapped = false;
	let wasOpen = false;
</script>

<!-- A flex box, because the tooltip's markup leaves whitespace beside the chip,
     and in a sentence that would be a space before the punctuation after it; a
     flex box draws none. -->
<span class="orientation">
	<Tooltip.Provider delayDuration={200}>
		<Tooltip.Root bind:open disableCloseOnTriggerClick>
			<Tooltip.Trigger
				class="orientation-chip"
				onpointerdown={(event) => {
					tapped = event.pointerType === "touch";
					wasOpen = open;
				}}
				onclick={() => {
					if (tapped) open = !wasOpen;
				}}
			>
				<span aria-hidden="true">{poseLabel(orientation)}</span>
				<span class="visually-hidden">{name}</span>
			</Tooltip.Trigger>
			<!-- Not portalled, and fixed, as `PoseChip`'s is. Spans, since it sits
			     in a paragraph. -->
			<Tooltip.Content side="top" sideOffset={6} collisionPadding={8} strategy="fixed">
				{#snippet child({ props, wrapperProps, open })}
					{#if open}
						<span {...wrapperProps}>
							<span {...props} class="orientation-tooltip">
								<img src={glyph} alt="" />
								<span>{name}</span>
							</span>
						</span>
					{/if}
				{/snippet}
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
</span>

<style>
	.orientation {
		display: inline-flex;
	}

	/* Sized to the line it sits in, so the spacing between lines never changes. */
	:global(.orientation-chip) {
		padding: 0 0.45em;
		border: 2px solid var(--card-border);
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.85em;
		font-weight: 600;
		line-height: 1.25;
		white-space: nowrap;
		cursor: default;
	}

	:global(.orientation-chip:focus-visible) {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	.orientation-tooltip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--page);
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		/* bits-ui lifts this onto its wrapper. Over a viewer's buttons, which are 1. */
		z-index: 2;
	}

	/* The size the pictures were saved at, 120 CSS px. */
	.orientation-tooltip img {
		width: 7.5rem;
		height: 7.5rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
