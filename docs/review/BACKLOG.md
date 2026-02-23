# Review Backlog

_Last reviewed: 2026-02-22 (cycle 8). Files reviewed: src/main.ts, src/style.css, index.html, CHANGELOG.md. Build: passing. Tests: 42/42 pass._

<!-- All items from cycle 7 resolved 2026-02-22:

  - Correctness: EN→BG sense always hidden even when no BG details available — FIXED.
    Hoisted `bgDetails` array out of the `if (dir === 'en-bg')` block so its length is visible
    to the sense condition below. Changed `dir !== 'en-bg'` to `dir !== 'en-bg' || bgDetails.length === 0`.
    src/main.ts ~line 334.

  - Simplification/Documentation: duplicate `### Fixed` sections and missing EN→BG feature entry in CHANGELOG.md — FIXED.
    Merged the two `### Fixed` blocks into one. Added `### Added` entry for EN→BG word details feature.
    Removed stale "now 40 tests" note (tests are now 42).
-->
