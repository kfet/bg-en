# Review Backlog

_Last reviewed: 2026-02-22 (cycle 11, post-fix). Files reviewed: scripts/test_search.mjs, src/main.ts, src/style.css, index.html, CHANGELOG.md. Build: passing. Tests: 48/48 pass._

<!-- Resolved this cycle (2026-02-22):

  - Simplification/Documentation: stale "42 tests total" in CHANGELOG.md — FIXED. Updated to "48 tests total".
  - Test Coverage: lookupExact had no assertions — FIXED. 6 assertions added; tests now 48.
  - Test Coverage: sort-order sampling was every 1000th entry — FIXED. Now samples every 20th (~5% of consecutive pairs).
  - Accessibility: #results div had no aria-live — FIXED. aria-live="polite" added to index.html.
  - Simplification: installBtn async-in-then pattern — FIXED. Rewritten as async IIFE.
  - Simplification: dead CSS .row-hidden — FIXED. Removed from style.css.
  - Simplification/Documentation: two separate ### Added sections in CHANGELOG — FIXED. Merged into one.
-->
