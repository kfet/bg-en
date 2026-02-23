# URGENT Review Issues

_No open urgent items._

<!-- Resolved items:
  - 2026-02-22: Staged accent-fix not committed; 35% of BG headwords unreachable — FIXED.
    Committed fold() U+0301 strip in search.ts + matching sort key in build_data.py (commit 8f3ad5a).
    CI will rebuild data with accent-stripped sort and redeploy.
  - 2026-02-22: Race condition: onProgress(100) fires before bgEnData/enBgData set — FIXED.
    Moved onProgress(100) call to after bgEnData=bg;enBgData=en assignments in search.ts (commit 8f3ad5a).
  - 2026-02-21: Missing go.mod — FIXED. go.mod created at project root; go build passes.
  - 2026-02-21: .gitignore:18 pattern 'mockserver' too broad — FIXED. Changed to '/mockserver' to anchor to repo root; main_test.go now tracked and committed.
  - 2026-02-21: Unused `bufio` import in main_test.go — INVALID (stale). Was mid-edit state; commit 6489987 completed TestHandleCompletions with bufio fully used. go vet and all 25 tests pass.
  - 2026-02-21: `offlineBanner` declared but never used (TS6133) — FIXED. T22 online/offline listeners are wired; `offlineBanner.classList.toggle('hidden', ...)` called in `updateOnlineStatus()`.
-->
