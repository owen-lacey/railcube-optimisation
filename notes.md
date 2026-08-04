My eldest has finally got to the age where I can be quite tactical about what gifts he receives so I can enjoy them too

My son got a railcube for Christmas. It's like if Duplo did rollercoasters, it's freaking awesome. 

On Christmas day, I obsessively played with this trying to build a track. I've always enjoyed completeness: if I go for a walk, it needs to be a circle, none of this "there and back". If I have a plate of food, I do everything I can to finish it. When I build a railcube, I need to use every piece.

  


Doing this on Christmas day way a harder task than I thought, and my son soon lost interest. Keeping track of all the variables was impossible for my brain to do. But not for a computer to do!!

  


8 months later, I finally got round to putting this to the test, and boy did it deliver (screenshot).

I'm gonna break down how I did this, and how you can do it yourself.

  


# modelling the problem 

  


Tracks can only move orthogonally; that is, up, down, left, right, forwards &amp; backwards - 6 total.

A straight track represents a move forwards relative to its current position, a left turn is 1 step forward and two steps left, etc

  


Similarly, the train could change orientation, it could climb up a wall, or down vertically. It can assume any position on the 6-faced cube, facing in any of the 4 directions - 24 total

  


Let's combine this with our positions to show how we represent adding a piece to the track

  


Once we have our initial position, the position of the track at any point in time simply becomes the combinations of all of the track pieces before it.

  


Therefore, to enforce a closed loop, we need to tell the programme that the position of the last track piece equals the starting piece.

  


Here's the animation

  


# adding costs

  


Two approaches here:

- under no circumstances should we drop a piece

- try not to drop a piece

Pick either based on what you want the output to be. One is a suggestion, one is a command.

  


I opted for the former

  


Many ways we can optimise this:

- score "cool" parts at cool inversions

- score % of time not flat

- penalise consecutive pieces of the same type

Show examples of a track being build and their score

  


Show final optimal route (maybe irl as well)