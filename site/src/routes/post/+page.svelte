<script>
  // The prose is a straight transcription of notes.md — the wording is Owen's
  // first draft and is not to be edited here. Every visualisation the draft
  // calls for is an empty Placeholder until it is built.
  import Placeholder from '$lib/components/Placeholder.svelte';
</script>

<h1>Optimal Rail Cube</h1>

<p>
  My eldest, Reuben, has finally got to the age where I can be quite tactical about what gifts he receives.
  For Christmas this year, he got a <a href="https://www.railcubetoys.com/">Rail Cube</a>. It's like if Duplo did rollercoasters, and it's freaking
  awesome.
</p>

<p>
  Much to the displeasure of my loved ones, I spent a considerable amount of time that day messing about with it. I've always enjoyed
  completeness: if I go for a walk it needs to be a circle, none of this "there and back". If I
  have a plate of food, I do everything I can to finish it (this has had consequences). When I build a railcube, I must use every  piece.
</p>

<p>
  Here are one-thousand different ways to build a track with the following pieces: XXX. 
</p>

<Placeholder />

<p>
  No pieces left in the box, ever. No excuses. Reuben doesn't seem to care at the moment, but I like to think I'm raising him in such a way that he will eventually.
</p>
<p>
  Hopefully I've convinced you already that I couldn't have created all of these myself manually. I'm going to show you how I built a program to generate these shapes for me. Stay with me, you don't need to be a rocket scientist to get this, I promise.
</p>

<h2>Defining the model</h2>

<p>Here's the plan of attack:</p>
<ol>
  <li>Create a coordinate system the track can exist on</li>
  <li>Define each track piece in that coordinate system</li>
  <li>Model how we add pieces together</li>
</ol>
<p>Once we have these, we can build our model</p>

<h3>1. The coordinate system</h3>
<p>
  As much as I would like it to go without saying, these tracks occupy 3D space. This means you can go up, down, left, right, forwards, or backwards. 
  We call this type of movement <i>orthogonal</i>.
</p>

<Placeholder />

<p>
  At any given point on its journey, the train exists in exactly one of these boxes.
  The train can then move to any box orthogonal to it depending on where the track is heading.
</p>
<Placeholder />

<p>
  A straight track represents a move forwards relative to its current position, a left turn is 1
  step forward and two steps left, etc
</p>

<Placeholder />

<p>
  Similarly, the train could change orientation, it travel alongside a wall, or down vertically. It
  can assume any position on the 6-faced cube, facing in any of the 4 directions. That makes 24 possible directions for every box.
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
