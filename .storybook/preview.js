// The viewers were designed against the app's dark theme, and the CSS custom
// properties in app.css are what every component reads its colours from.
import '../site/src/app.css';

/** @type { import('@storybook/sveltekit').Preview } */
export default {
  parameters: {
    backgrounds: {
      options: {
        app: { name: 'App', value: '#0f172a' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'app' },
  },
};
