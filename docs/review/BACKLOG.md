# Review Backlog

_Last reviewed: 2026-02-22 (cycle 24). Files reviewed: AGENTS.md, scripts/test_search.mjs. Build: passing. Tests: 55/55 pass._

---

## No open items

All backlog items from the current review cycle have been fixed or accepted.

---

<!-- Resolved (2026-02-22, all commits):

  - Test Coverage: POS validity assertion checked bgEn.entries only — FIXED. Added matching badPosEN assertion on enBg.entries; tests now 55.
  - Documentation: AGENTS.md valid POS list had only 9 values, missing interj/pron/conj/det — FIXED. Updated to all 13 values.
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
  - Simplification: CSS dark-mode var duplication — ACCEPTED AS-IS (no clean CSS-only fix).
  - Test Coverage: loadDictionary race condition regression test — ACCEPTED AS-IS (LOW PRIORITY).
-->
