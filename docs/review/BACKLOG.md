# Review Backlog

_Last reviewed: 2026-02-22 (cycle 23, post-c851511). Files reviewed: .github/workflows/deploy.yml, src/search.ts, src/main.ts, src/style.css, index.html, scripts/build_data.py, scripts/test_search.mjs, scripts/smoke_test.js, vite.config.ts, CHANGELOG.md. Build: passing. Tests: 54/54 pass._

---

## No open items

All backlog items from the current review cycle have been fixed or accepted.
The queue is clear. The next review cycle will populate new items.

---

<!-- Resolved (2026-02-22, commits 8f3ad5a + 158c1fd + c851511 + fb8aa99):

  - URGENT: Staged accent-fix not committed; 35% of BG headwords unreachable — FIXED.
  - URGENT: onProgress(100) race condition — FIXED.
  - Correctness: highlightPrefix accent bug — FIXED.
  - Correctness: loadPromise never reset on failure — FIXED.
  - Simplification: isLoaded() dead code — FIXED.
  - Documentation: Two separate ### Added sections in CHANGELOG — FIXED.
  - Documentation: CHANGELOG "48 tests total" stale — FIXED. Updated to "54 tests total".
  - Accessibility: #results role="list" ARIA violation — FIXED. Changed to role="region".
  - Deployment: CacheFirst → StaleWhileRevalidate for dict-data cache — FIXED.
  - Deployment: Hardcoded cache key could silently serve stale data if VERSION bumped manually — FIXED. CI verify step added to deploy.yml.
  - Test Coverage: smoke_test.js stale selectors (#btn-en-bg, #btn-auto, port 5050) — FIXED.
  - Simplification/Documentation: stale "42 tests total" in CHANGELOG.md — FIXED.
  - Test Coverage: lookupExact had no assertions — FIXED.
  - Test Coverage: sort-order sampling was every 1000th entry — FIXED.
  - Accessibility: #results div had no aria-live — FIXED.
  - Simplification: installBtn async-in-then pattern — FIXED.
  - Simplification: dead CSS .row-hidden — FIXED.
  - Simplification: CSS dark-mode var duplication (style.css:27-69 + 480-488 + 705-713) — ACCEPTED AS-IS.
    There is no clean CSS-only deduplification without CSS nesting (partial browser support).
    The two blocks (media query + attribute selector) are idiomatic and ~45 lines total;
    maintenance burden is low since check-data-update.yml updates both blocks atomically.
  - Test Coverage: loadDictionary race condition regression test — ACCEPTED AS-IS (LOW PRIORITY).
    Mock-based Node test risks brittleness by reimplementing internal Promise scheduling.
    The fix is verified by code review and the moved onProgress(100) is clearly correct.
-->
