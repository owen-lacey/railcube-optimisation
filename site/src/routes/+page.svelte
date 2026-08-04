<script>
  // The prose is a straight transcription of notes.md — the wording is Owen's
  // first draft and is not to be edited here. Every visualisation the draft
  // calls for is an empty Placeholder until it is built.
  import Placeholder from '$lib/components/Placeholder.svelte';
</script>

<h1>Rail Cube</h1>

<p>
  My eldest has finally got to the age where I can be quite tactical about what gifts he receives
  so I can enjoy them too
</p>

<p>
  My son got a railcube for Christmas. It's like if Duplo did rollercoasters, it's freaking
  awesome.
</p>

<p>
  On Christmas day, I obsessively played with this trying to build a track. I've always enjoyed
  completeness: if I go for a walk, it needs to be a circle, none of this "there and back". If I
  have a plate of food, I do everything I can to finish it. When I build a railcube, I need to use
  every piece.
</p>

<Placeholder />

<p>
  Doing this on Christmas day way a harder task than I thought, and my son soon lost interest.
  Keeping track of all the variables was impossible for my brain to do. But not for a computer to
  do!!
</p>

<p>
  8 months later, I finally got round to putting this to the test, and boy did it deliver
  (screenshot).
</p>

<Placeholder />

<p>I'm gonna break down how I did this, and how you can do it yourself.</p>

<h2>modelling the problem</h2>

<p>
  Tracks can only move orthogonally; that is, up, down, left, right, forwards &amp; backwards - 6
  total.
</p>

<p>
  A straight track represents a move forwards relative to its current position, a left turn is 1
  step forward and two steps left, etc
</p>

<Placeholder />

<p>
  Similarly, the train could change orientation, it could climb up a wall, or down vertically. It
  can assume any position on the 6-faced cube, facing in any of the 4 directions - 24 total
</p>

<Placeholder />

<p>Let's combine this with our positions to show how we represent adding a piece to the track</p>

<Placeholder />

<p>
  Once we have our initial position, the position of the track at any point in time simply becomes
  the combinations of all of the track pieces before it.
</p>

<p>
  Therefore, to enforce a closed loop, we need to tell the programme that the position of the last
  track piece equals the starting piece.
</p>

<Placeholder caption="Here's the animation" />

<h2>adding costs</h2>

<p>Two approaches here:</p>

<ul>
  <li>under no circumstances should we drop a piece</li>
  <li>try not to drop a piece</li>
</ul>

<p>Pick either based on what you want the output to be. One is a suggestion, one is a command.</p>

<p>I opted for the former</p>

<p>Many ways we can optimise this:</p>

<ul>
  <li>score "cool" parts at cool inversions</li>
  <li>score % of time not flat</li>
  <li>penalise consecutive pieces of the same type</li>
</ul>

<Placeholder caption="Show examples of a track being build and their score" />

<Placeholder caption="Show final optimal route (maybe irl as well)" />

<style>
  h1 {
    font-size: 2.25rem;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 0 0 2.5rem;
  }

  h2 {
    font-size: 1.4rem;
    line-height: 1.2;
    margin: 3.5rem 0 1.25rem;
  }

  p {
    font-size: 1.0625rem;
    line-height: 1.65;
    margin: 0 0 1.25rem;
  }

  ul {
    font-size: 1.0625rem;
    line-height: 1.65;
    margin: 0 0 1.25rem;
    padding-left: 1.25rem;
  }

  li {
    margin-bottom: 0.375rem;
  }
</style>
