# Review Backlog

_Last reviewed: 2026-02-22 (cycle 23, post-c851511). Files reviewed: .github/workflows/deploy.yml, src/search.ts, src/main.ts, src/style.css, index.html, scripts/build_data.py, scripts/test_search.mjs, scripts/smoke_test.js, vite.config.ts, CHANGELOG.md. Build: passing. Tests: 54/54 pass._

---

## Test Coverage

- **`scripts/test_search.mjs`** — No regression test for the `loadDictionary` race condition fix (commit `158c1fd`). Add a Node test that verifies the data is accessible synchronously inside the `onProgress(100)` callback (requires mocking `fetchDataset` with resolved promises). Low priority since the fix is verified manually and by code review; adding a mock-based test risks brittleness.

---

## Simplification

- **`src/style.css:27–69`** — Dark-mode CSS custom properties are declared twice with identical content: once inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` (lines 27–47) and once in `[data-theme="dark"] { … }` (lines 49–69). The same duplication recurs for `.trans` dark color and `.ios-hint` border-color. These duplicate blocks could be collapsed with the `:where()` selector, or kept as-is (~45 lines total, low maintenance burden).

---

<!-- Resolved (2026-02-22, commits 8f3ad5a + 158c1fd + c851511 + latest):

  - URGENT: Staged accent-fix not committed; 35% of BG headwords unreachable — FIXED.
  - URGENT: onProgress(100) race condition — FIXED.
  - Correctness: highlightPrefix accent bug — FIXED.
  - Correctness: loadPromise never reset on failure — FIXED.
  - Simplification: isLoaded() dead code — FIXED.
  - Documentation: Two separate ### Added sections in CHANGELOG — FIXED.
  - Documentation: CHANGELOG "48 tests total" stale — FIXED. Updated to "54 tests total".
  - Accessibility: #results role="list" ARIA violation — FIXED. Changed to role="region".
  - Deployment: CacheFirst → StaleWhileRevalidate for dict-data cache — FIXED.
  - Deployment: Hardcoded cache key could silently serve stale data if VERSION bumped manually — FIXED. Added CI verify step in deploy.yml that extracts VERSION from build_data.py and asserts the cache key contains it; fails build with clear error if mismatched.
  - Test Coverage: smoke_test.js stale selectors (#btn-en-bg, #btn-auto, port 5050) — FIXED.
  - Simplification/Documentation: stale "42 tests total" in CHANGELOG.md — FIXED.
  - Test Coverage: lookupExact had no assertions — FIXED.
  - Test Coverage: sort-order sampling was every 1000th entry — FIXED.
  - Accessibility: #results div had no aria-live — FIXED.
  - Simplification: installBtn async-in-then pattern — FIXED.
  - Simplification: dead CSS .row-hidden — FIXED.
-->
