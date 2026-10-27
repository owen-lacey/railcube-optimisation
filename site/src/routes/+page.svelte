<script>
  // The front page: the post's track builder on its own, to beat the score with.
  // The address keeps the track as `?track=`, so a reload, or a link from the
  // leaderboard, opens it where it was left.
  //
  // The page is prerendered, so the address is read once the router is up, not at
  // render: a prerendered page has no query to read, and `replaceState` throws
  // before then. A leaderboard link to another track is a navigation too.
  import { afterNavigate, replaceState } from '$app/navigation';
  import TrackBuilder from '$lib/components/TrackBuilder.svelte';

  let shape = $state('');
  let routed = false;

  afterNavigate(({ to }) => {
    shape = to.url.searchParams.get('track') ?? '';
    routed = true;
  });

  function keep(letters) {
    if (!routed) return;
    const url = new URL(location.href);
    if (letters) url.searchParams.set('track', letters);
    else url.searchParams.delete('track');
    replaceState(url, {});
  }
</script>

<svelte:head>
  <title>Rail Cube track builder</title>
</svelte:head>

<h1>Rail Cube track builder</h1>

<TrackBuilder {shape} onchange={keep} />
