// Vite is here for exactly one reason.
//
// The live-solving spike runs the solver in a Web Worker — it has to, because solve()
// blocks whichever thread it is on for the whole search. That worker imports
// src/solver/index.js, which imports the bare specifier 'cpsat-js'. Browsers cannot
// resolve bare specifiers, and a module worker cannot be handed an import map either:
// import maps are declared by a document, and a worker has no document. So the spike
// needs a dev server that rewrites the specifier, and `python3 -m http.server` is not
// one. Everything else in spikes/ still works as plain files.
export default {
  optimizeDeps: {
    // esbuild's pre-bundling rewrites cpsat-js's `new URL('../build/portable/cpsat.wasm',
    // import.meta.url)` into a path that no longer reaches the binary, and the solver
    // then fails to load with nothing useful in the console. Excluded, the package is
    // served exactly as published.
    exclude: ['cpsat-js'],
  },
  // No COOP/COEP headers, deliberately. Those would let the browser load the threaded
  // WASM build, which is 5-10x faster — but it is also the build whose solution
  // callbacks cannot reach JS mid-search, so the page would go back to showing nothing
  // until the end. Single-worker and watchable beats threaded and blank.
};
