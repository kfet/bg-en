# Review Backlog

_Last reviewed: 2026-02-22 (cycle 22, post-158c1fd). Files reviewed: src/search.ts, src/main.ts, src/style.css, index.html, scripts/build_data.py, scripts/test_search.mjs, scripts/smoke_test.js, vite.config.ts, .github/workflows/deploy.yml, .github/workflows/check-data-update.yml, CHANGELOG.md. Build: passing. Tests: 54/54 pass._

---

## Deployment

- **`.github/workflows/deploy.yml:39`** — Cache key `wikdict-kaikki-ipadict-unimorph-2025-11` is hardcoded. For the normal monthly flow this is fine — `check-data-update.yml` updates **both** `VERSION` in `build_data.py` and the matching cache key in `deploy.yml` atomically in its PR. However, if a developer manually bumps `VERSION` in `build_data.py` without also updating the cache key, stale SQLite files are served from cache and outdated data is deployed silently. Consider adding a CI check (or a `pre-commit` hook) that asserts the version substring in the deploy.yml cache key matches `VERSION` in `build_data.py`.

---

## Test Coverage

- **`scripts/test_search.mjs`** — No regression test for the `loadDictionary` race condition fix (commit `158c1fd`). Add a Node test that verifies the data is accessible synchronously inside the `onProgress(100)` callback (requires mocking `fetchDataset` with resolved promises). Low priority since the fix is verified manually and by code review; adding a mock-based test risks brittleness.

---

## Simplification

- **`src/style.css:27–69`** — Dark-mode CSS custom properties are declared twice with identical content: once inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` (lines 27–47) and once in `[data-theme="dark"] { … }` (lines 49–69). The same duplication recurs for `.trans` dark color and `.ios-hint` border-color. These duplicate blocks could be collapsed with the `:where()` selector, or kept as-is (~45 lines total, low maintenance burden).

---

<!-- Resolved (2026-02-22, commits 8f3ad5a + 158c1fd):

  - URGENT: Staged accent-fix not committed; 35% of BG headwords unreachable — FIXED. fold() strips U+0301; build_data.py sort key matches.
  - URGENT: onProgress(100) race condition — FIXED. Moved onProgress(100) after bgEnData/enBgData assignment.
  - Correctness: highlightPrefix accent bug — FIXED. Uses exported fold() from search.ts with char-walk for U+0301.
  - Correctness: loadPromise never reset on failure — FIXED. .catch resets loadPromise=null.
  - Simplification: isLoaded() dead code — FIXED. Removed from search.ts.
  - Documentation: Two separate ### Added sections in CHANGELOG — FIXED. Merged into one block.
  - Documentation: CHANGELOG "48 tests total" stale — FIXED. Updated to "54 tests total".
  - Accessibility: #results role="list" ARIA violation — FIXED. Changed to role="region"; removed role="listitem" from article cards.
  - Deployment: CacheFirst → StaleWhileRevalidate for dict-data cache — FIXED. vite.config.ts updated.
  - Test Coverage: smoke_test.js stale selectors (#btn-en-bg, #btn-auto, port 5050) — FIXED. Rewritten to auto-detect via #dir-indicator; port updated to 5177; accent-insensitive test added.
  - Simplification/Documentation: stale "42 tests total" in CHANGELOG.md — FIXED.
  - Test Coverage: lookupExact had no assertions — FIXED. 6 assertions added.
  - Test Coverage: sort-order sampling was every 1000th entry — FIXED. Now every 20th.
  - Accessibility: #results div had no aria-live — FIXED. aria-live="polite" added to index.html.
  - Simplification: installBtn async-in-then pattern — FIXED.
  - Simplification: dead CSS .row-hidden — FIXED.
-->
