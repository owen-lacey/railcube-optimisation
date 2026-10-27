<script>
  // Offered once a builder's track closes: send it to the leaderboard, with notes
  // only Owen reads, and then see where it ranks.
  //
  // A native modal `<dialog>`, as `ExpandingCard`'s full screen is, so opened over a
  // full-screen builder it stacks above it in the top layer. The score shown here is
  // the browser's; the one on the board is the Worker's own, from the same `assess`.
  import { afterNavigate } from '$app/navigation';
  import Leaderboard from './Leaderboard.svelte';
  import { submit, standings } from '$lib/leaderboard.js';
  import { NOTES_LIMIT } from '$lib/submission.js';

  // `shape` is the closed track's letters, `score` its score at the post's weights.
  let { shape, score } = $props();

  let dialog = $state(null);
  let notes = $state('');
  // 'form', 'sending' or 'sent'; `error` is the Worker's reason or the network's.
  let stage = $state('form');
  let error = $state(null);
  let sent = $state(null);
  let board = $state(null);

  // A leaderboard link opens that track in the front page's builder, so it goes.
  afterNavigate(() => dialog?.close());

  /** Opens the dialog for the track as it stands. */
  export function offer() {
    if (sent?.shape !== shape) {
      stage = 'form';
      error = null;
    }
    dialog.showModal();
  }

  async function send(event) {
    event.preventDefault();
    stage = 'sending';
    error = null;
    try {
      sent = await submit(shape, notes);
      board = await standings(sent.id);
      stage = 'sent';
    } catch (failure) {
      error = failure.message;
      stage = 'form';
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="submit-title">
  {#if stage === 'sent'}
    <h2 id="submit-title">{sent.duplicate ? 'Already on the board' : 'Submitted'}</h2>
    <p>
      {sent.duplicate
        ? `Someone got there first: this track is on the board at rank ${sent.rank}.`
        : `Your track scores ${sent.score}, rank ${sent.rank}.`}
    </p>
    <Leaderboard standings={board} />
    <form method="dialog" class="actions"><button>Close</button></form>
  {:else}
    <h2 id="submit-title">Track complete</h2>
    <p>It scores {score}. Submit it to the leaderboard?</p>
    <form onsubmit={send}>
      <label for="submit-notes">Artist's notes <span>(optional, only Owen reads them)</span></label>
      <textarea id="submit-notes" bind:value={notes} maxlength={NOTES_LIMIT} rows="4"></textarea>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" onclick={() => dialog.close()}>Not now</button>
        <button type="submit" class="primary" disabled={stage === 'sending'}>
          {stage === 'sending' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(32rem, calc(100% - 2rem));
    padding: 1.25rem;
    border: 1px solid var(--card-border);
    border-radius: 0.75rem;
    background: var(--card-footer);
    color: var(--ink);
  }

  dialog::backdrop {
    background: var(--dialog-backdrop);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
  }

  p {
    margin: 0 0 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.35rem;
  }

  label span {
    color: var(--muted);
    font-size: 0.85rem;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem;
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    background: var(--page);
    color: inherit;
    font: inherit;
    resize: vertical;
  }

  .error {
    margin: 0.5rem 0 0;
    color: var(--error-text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--page);
    font-weight: 600;
  }
</style>
