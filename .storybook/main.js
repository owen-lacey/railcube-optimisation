/** @type { import('@storybook/sveltekit').StorybookConfig } */
export default {
  // The app's source is under site/; the repo root's src/ is the model.
  stories: ['../site/src/**/*.stories.js'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/sveltekit',
};
