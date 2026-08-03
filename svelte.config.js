import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter(),
    // The app's source lives in site/; the repo root's own src/ is the model.
    // Every `files` entry is set, including the ones with no file yet, so
    // nothing quietly defaults to a path inside the model.
    files: {
      assets: 'site/static',
      lib: 'site/src/lib',
      routes: 'site/src/routes',
      params: 'site/src/params',
      hooks: {
        client: 'site/src/hooks.client',
        server: 'site/src/hooks.server',
        universal: 'site/src/hooks',
      },
      serviceWorker: 'site/src/service-worker',
      appTemplate: 'site/src/app.html',
      errorTemplate: 'site/src/error.html',
    },
    outDir: 'site/.svelte-kit',
  },
};
