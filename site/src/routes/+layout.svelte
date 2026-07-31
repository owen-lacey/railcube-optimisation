<script>
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import '../app.css';

  let { children } = $props();

  const nav = [
    { href: '', label: 'Overview' },
    { href: '/pieces', label: 'Pieces' },
    { href: '/layouts', label: 'Layouts' },
    { href: '/solve', label: 'Watch it solve' },
  ];

  const current = $derived(page.url.pathname.replace(base, '') || '/');
  const isActive = href => (href === '' ? current === '/' : current.startsWith(href));
</script>

<a class="skip" href="#main">Skip to content</a>

<header>
  <div class="bar">
    <a class="brand" href="{base}/">
      <span class="cube" aria-hidden="true"></span>
      Rail Cube
    </a>
    <nav aria-label="Sections">
      {#each nav as item (item.href)}
        <a href="{base}{item.href}" aria-current={isActive(item.href) ? 'page' : undefined}>
          {item.label}
        </a>
      {/each}
    </nav>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<footer>
  <p>
    A constraint model for a children's magnetic monorail toy — and the working notes
    for a blog post about it.
  </p>
  <p class="muted">
    Solved with <a href="https://github.com/owen-lacey/cpsat-js">cpsat-js</a>, a WebAssembly
    port of OR-Tools CP-SAT. Rendered with <a href="https://polycss.com">PolyCSS</a>, which
    draws every polygon as a real DOM element.
  </p>
</footer>

<style>
  .skip {
    position: absolute;
    left: -9999px;
  }
  .skip:focus {
    left: 1rem;
    top: 1rem;
    z-index: 10;
    background: var(--accent);
    color: #0f172a;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #0f172aee;
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }

  .bar {
    max-width: var(--wide);
    margin: 0 auto;
    padding: 0.7rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--fg);
    text-decoration: none;
    font-size: 1.02rem;
    white-space: nowrap;
    flex: none;
  }

  .cube {
    width: 15px;
    height: 15px;
    border-radius: 3px;
    background: linear-gradient(135deg, #ffd166 0 45%, #aab2bf 45% 55%, #ffd166 55%);
  }

  nav {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin-left: auto;
  }

  nav a {
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.9rem;
    border: 1px solid transparent;
  }

  nav a:hover {
    color: var(--fg);
    background: #ffffff0d;
  }

  nav a[aria-current='page'] {
    color: var(--fg);
    background: #ffffff12;
    border-color: var(--line);
  }

  footer {
    max-width: var(--wide);
    margin: 4rem auto 0;
    padding: 2rem 1.25rem 3rem;
    border-top: 1px solid var(--line);
    font-size: 0.88rem;
  }

  footer p {
    margin: 0 0 0.5rem;
    max-width: 60ch;
  }

  @media (max-width: 620px) {
    .bar {
      gap: 0.6rem;
      padding: 0.55rem 1rem;
      flex-wrap: nowrap;
    }
    .brand {
      font-size: 0.95rem;
    }
    /* One scrollable row rather than two wrapped ones: a nav that wraps costs
       nearly a fifth of a phone screen before any content appears. */
    nav {
      margin-left: auto;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    nav::-webkit-scrollbar {
      display: none;
    }
    nav a {
      font-size: 0.82rem;
      padding: 0.28rem 0.55rem;
      white-space: nowrap;
    }
  }
</style>
