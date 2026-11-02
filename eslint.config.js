// Two rules, both the owner's: cyclomatic complexity under 10, and nothing
// declared that is never read. eslint-plugin-svelte's base config only teaches
// ESLint to parse .svelte files; it turns no rules on.
import svelte from 'eslint-plugin-svelte';

const RULES = {
  complexity: ['error', 9],
  'no-unused-vars': 'error',
};

export default [
  {
    ignores: ['**/node_modules/', 'build/', 'storybook-static/', 'site/.svelte-kit/', 'worker/.wrangler/'],
  },
  ...svelte.configs.base,
  {
    files: [
      'src/**/*.js', 'site/src/**/*.js', 'site/src/**/*.svelte', 'scripts/**/*.js',
      'worker/**/*.js', 'tests/**/*.js', '.storybook/**/*.js', '*.js',
    ],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: RULES,
  },
];
