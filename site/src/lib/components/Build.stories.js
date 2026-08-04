// A layout clicking itself together, one piece at a time, in the order the route
// is walked — which is the order the real cubes would go on. The train sets off
// once the loop closes.
//
// The cubes click male-to-female along the direction of travel, so a piece is not
// pressed onto the track from outside — it is brought into line with the rail and
// slid on from the end, arriving from the side the previous piece's male end points
// at. An arrival is therefore described in the piece's own frame, which is why one
// bound for the underside of the track rises up at it from below.
//
// Nothing is simulated: a pile of fallen cubes does not know which track it used
// to be, so a build is a scripted tween rather than the tumbler run backwards.
// The animation is in `src/lib/render/build.js`.

import BuildViewer from './BuildViewer.svelte';

export default {
  title: 'Build',
  component: BuildViewer,
  argTypes: {
    shape: { control: 'text' },
    pace: { control: { type: 'range', min: 0.02, max: 2, step: 0.02 } },
    speed: { control: { type: 'range', min: 0.5, max: 4, step: 0.1 } },
    aspect: { control: 'text' },
  },
};

export const Default = {
  args: { shape: 'LIRIROSOLORLLSORII', pace: 0.1 },
  parameters: {
    docs: {
      description: {
        story: 'The model\'s own 18-cube set, assembling in route order — under three '
          + 'seconds, and then it is driven. At this pace a piece is still in the air when '
          + 'the next three set off, so arrivals read as a stream.',
      },
    },
  },
};

export const Ring = {
  name: 'A ring of four curves',
  args: { shape: 'LLLL', pace: 0.1 },
  parameters: {
    docs: {
      description: {
        story: 'The smallest closed loop there is, so it is the clearest look at what one '
          + 'arrival does: the tumble into line, and then the slide down the rail onto the '
          + 'joint. The last of the four has both ends mated and so has no free axis to come '
          + 'in on — a real track has to be flexed to close, and this one just slides.',
      },
    },
  },
};

export const Slow = {
  name: 'One arrival, slowly',
  args: { shape: 'LLLL', pace: 1.6 },
  parameters: {
    docs: {
      description: {
        story: 'The same four curves at four times the interval. The flight itself is a '
          + 'fixed third of a second, so what this stretches is the pause between pieces '
          + '— which is what makes each arrival watchable on its own.',
      },
    },
  },
};

export const Cramped = {
  name: 'Two rings threaded together',
  args: { shape: 'SSRRIIRRLLIISSSLLS', pace: 0.1 },
  parameters: {
    docs: {
      description: {
        story: 'The `cramped` layout — two vertical rings threaded through each other in a '
          + 'three-cell box. Watching it built is the easiest way to see how they thread: '
          + 'the finished thing is hard to read as one closed route. It is also the best '
          + 'look at arrivals from every side, since a layout this tight puts rails on all '
          + 'six faces.',
      },
    },
  },
};
