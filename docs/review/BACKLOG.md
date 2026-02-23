# Review Backlog

_Last reviewed: 2026-02-22 (cycle 6). Files reviewed: src/main.ts, src/search.ts, src/style.css, index.html, vite.config.ts, scripts/build_data.py, scripts/test_search.mjs, .github/workflows/deploy.yml. Build: passing. Tests: 40/40 pass._

<!-- All items from cycle 5 resolved 2026-02-22:

  - Security: `posTag()` fallback not HTML-escaped — FIXED. Wrapped fallback with `escHtml()` in src/main.ts:84.
  - Correctness: missing `apple-mobile-web-app-capable` meta tag — FIXED. Added both `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags to index.html.
  - Correctness: `addRecent()` fires on every debounced keystroke — INVALID (already correct). The debounce timer calls `runSearch` with no args (saveToRecent=false); addRecent only fires on explicit submit (Enter, chip click, translation click).
  - Test Coverage: sorted-order check only covers bg-en dataset — FIXED. Added parallel en-bg sort assertion in scripts/test_search.mjs. Tests now 40/40.
  - Simplification: `.offline-banner` z-index without position property — FIXED. Added `position: relative` to src/style.css:.offline-banner.
-->
