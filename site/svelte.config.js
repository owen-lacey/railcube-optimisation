import adapter from '@sveltejs/adapter-static';

// Deployed as a GitHub Pages project site, which serves from
// /<repo>/ rather than from the domain root. BASE_PATH is set by the workflow;
// locally it is empty, so `npm run dev` and `npm run preview` serve from /.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // Every route is known and every page is prerendered (see src/routes/+layout.js),
    // so there is no SPA fallback to write — a missing page should 404 rather than
    // boot the app and show an empty shell.
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined }),
    paths: { base },
    // GitHub Pages runs Jekyll over anything it serves unless told not to, and
    // Jekyll drops directories beginning with an underscore. `appDir` moves the
    // built assets out of `_app`; static/.nojekyll covers everything else.
    appDir: 'app',
  },
};
