# Review Backlog

_Last reviewed: 2026-02-22 (cycle 19). Files reviewed: src/search.ts, src/main.ts, src/style.css, index.html, scripts/build_data.py, scripts/test_search.mjs, scripts/smoke_test.js, vite.config.ts, .github/workflows/deploy.yml, .github/workflows/check-data-update.yml, CHANGELOG.md. Build: passing. Tests: 54/54 pass._

---

## Accessibility

- **`index.html:62` + `src/main.ts:211,234`** — `#results` div has `role="list"` hardcoded in HTML, but its innerHTML is replaced with three different non-list structures: (a) `<p class="no-results">` (no listitem), (b) `<p class="result-count">` followed by `<article role="listitem">` cards — the `<p>` is a direct non-listitem child of `role="list"`, which is an ARIA spec violation, and (c) the empty state `<div class="empty-state">` (no listitem children). ARIA requires all direct children of `role="list"` to have `role="listitem"`. **Fix**: change `#results` to `role="region"` (or omit role entirely) and wrap only the article cards in an inner `<ul role="list">` / `<li role="listitem">`, or simply remove `role="list"` from the container — the `aria-live="polite"` + `aria-label` attributes are sufficient for screen reader announcements.

---

## Deployment

- **`.github/workflows/deploy.yml:39`** — Cache key `wikdict-kaikki-ipadict-unimorph-2025-11` is hardcoded. For the normal monthly flow this is fine — `check-data-update.yml` updates **both** `VERSION` in `build_data.py` and the matching cache key in `deploy.yml` atomically in its PR. However, if a developer manually bumps `VERSION` in `build_data.py` without also updating the cache key, stale SQLite files are served from cache and outdated data is deployed silently. Consider adding a CI check (or a `pre-commit` hook) that asserts the version substring in the deploy.yml cache key matches `VERSION` in `build_data.py`.

- **`vite.config.ts:17`** — Runtime cache strategy `CacheFirst` with fixed `cacheName: 'dict-data-v1'` means: once `bg-en.json`/`en-bg.json` are cached, they are served from the `dict-data-v1` cache for up to 30 days, even after a new WikiDict data deploy. The service-worker update (triggered by precache manifest hash changes) does NOT evict the `dict-data-v1` cache. Users who installed the PWA could see stale dictionary data for up to 30 days after a monthly data update. **Fix options** (in order of preference):
  1. **`StaleWhileRevalidate`** — serves cached data instantly but fetches fresh in background; user gets updated data on next load. Simplest fix with no other changes needed.
  2. **Version the cache name** — change `cacheName` to `'dict-data-2025-11'` and have `check-data-update.yml` bump it alongside VERSION. Old cache is abandoned; new data fetched immediately. Slightly more coordination required.
  The current `CacheFirst` is acceptable for a dictionary that almost never changes mid-month, but a monthly update cadence makes `StaleWhileRevalidate` the more appropriate strategy.

---

## Test Coverage

- **`scripts/smoke_test.js:24,28`** — Smoke test references `#btn-en-bg` (line 24) and `#btn-auto` (line 28) which no longer exist in the UI. These were direction-toggle buttons from a previous version; the current app uses auto-detection (`detectDirection()`) with no manual toggle buttons. Playwright would fail with "Element not found" at step 3. The smoke test needs rewriting to match current UI: remove `page.click('#btn-en-bg')` / `page.click('#btn-auto')` calls; instead verify `#dir-indicator` changes text after typing BG vs EN. Also update the port: `smoke_test.js` uses `localhost:5050` but `AGENTS.md` says the app is served at `:5177`.

- **`scripts/test_search.mjs`** — No test for the accent-insensitive highlight path. Since `highlightPrefix` is a UI-only function in `main.ts`, it cannot be unit-tested here. Consider adding a Playwright smoke test (or a separate Node helper) that verifies `<mark>` appears when searching "котка" and the headword "ко́тка" (with accent) is rendered.

---

## Simplification

- **`src/style.css:27–69`** — Dark-mode CSS custom properties are declared twice with identical content: once inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` (lines 27–47) and once in `[data-theme="dark"] { … }` (lines 49–69). The same duplication recurs for `.trans` dark color (lines 480–488) and `.ios-hint` border-color (lines 705–713). These three duplicate blocks could be collapsed with the `:where()` selector:
  ```css
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }
  [data-theme="dark"] { /* identical */ }
  ```
  →
  ```css
  :where([data-theme="dark"], :root:not([data-theme="light"]) body) { … }
  ```
  Or kept as-is (the duplication is ~45 lines total, low maintenance burden), but flagged for any future CSS refactor.

---

<!-- Resolved this cycle (2026-02-22):

  - URGENT: Accent-fix staged but not committed; 35% of BG headwords unreachable — FIXED (commit 8f3ad5a).
  - URGENT: Race condition: onProgress(100) fires before bgEnData/enBgData set — FIXED (commit 8f3ad5a).
  - Correctness: loadPromise never reset to null on failure — FIXED. .catch resets loadPromise=null.
  - Correctness: highlightPrefix uses toLowerCase instead of fold() — FIXED. Now uses exported fold() with char-walk for accurate split past U+0301.
  - Simplification: isLoaded() dead code — FIXED. Removed from search.ts.
  - Documentation: Two separate ### Added sections in CHANGELOG — FIXED. Merged into one block.
  - Documentation: CHANGELOG "48 tests total" stale — FIXED. Updated to "54 tests total".

  Previous cycle (2026-02-22 cycle 18):
  - Simplification/Documentation: stale "42 tests total" in CHANGELOG.md — FIXED. Updated to "48 tests total".
  - Test Coverage: lookupExact had no assertions — FIXED. 6 assertions added; tests now 48.
  - Test Coverage: sort-order sampling was every 1000th entry — FIXED. Now samples every 20th (~5% of consecutive pairs).
  - Accessibility: #results div had no aria-live — FIXED. aria-live="polite" added to index.html.
  - Simplification: installBtn async-in-then pattern — FIXED. Rewritten as async IIFE.
  - Simplification: dead CSS .row-hidden — FIXED. Removed from style.css.
  - Simplification/Documentation: two separate ### Added sections in CHANGELOG — FIXED. Merged into one.
-->
