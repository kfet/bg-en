# URGENT Review Issues

_All clear as of 2026-02-22. No urgent issues._

<!-- Previous URGENT items (now resolved):
  - 2026-02-22: src/search.ts:83 + build_data.py — Staged accent-fix not committed; 35% of BG headwords unreachable. FIXED in commit 8f3ad5a: fold() now strips U+0301 and build_data.py sort key matches.
  - 2026-02-22: src/search.ts:68 — Race condition: onProgress(100) fired before bgEnData/enBgData assigned; URL-param boot search showed "No results". FIXED in commit 8f3ad5a: onProgress(100) moved to after bgEnData=bg; enBgData=en assignments.
  - 2026-02-21: Missing go.mod — FIXED. go.mod created at project root; go build passes.
  - 2026-02-21: .gitignore:18 pattern 'mockserver' too broad — FIXED. Changed to '/mockserver' to anchor to repo root; main_test.go now tracked and committed.
  - 2026-02-21: Unused `bufio` import in main_test.go — INVALID (stale). Was mid-edit state; commit 6489987 completed TestHandleCompletions with bufio fully used. go vet and all 25 tests pass.
  - 2026-02-21: `offlineBanner` declared but never used (TS6133) — FIXED. T22 online/offline listeners are wired; `offlineBanner.classList.toggle('hidden', ...)` called in `updateOnlineStatus()`.
-->
