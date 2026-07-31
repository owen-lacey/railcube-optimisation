import { sveltekit } from '@sveltejs/kit/vite';

export default {
  plugins: [sveltekit()],
  optimizeDeps: {
    // esbuild's pre-bundling rewrites cpsat-js's `new URL('../build/portable/cpsat.wasm',
    // import.meta.url)` into a path that no longer reaches the binary, and the solver
    // then fails to load with nothing useful in the console. Excluded, the package is
    // served exactly as published.
    exclude: ['cpsat-js'],
  },
  worker: {
    // The solve worker dynamically imports cpsat-js's Emscripten glue, so its
    // bundle code-splits — and Rollup cannot code-split into Vite's default
    // `iife` worker format. Module workers are what the page asks for anyway.
    format: 'es',
  },
  server: {
    // The model lives at the repo root, outside this Vite root: the solve worker
    // imports ../../../src/solver/index.js. Dev has to be allowed to serve it.
    fs: { allow: ['..'] },
  },
  // No COOP/COEP headers, deliberately. Those would let the browser load the threaded
  // WASM build, which is 5-10x faster — but it is also the build whose solution
  // callbacks cannot reach JS mid-search, so the page would go back to showing nothing
  // until the end. Single-worker and watchable beats threaded and blank.
};
