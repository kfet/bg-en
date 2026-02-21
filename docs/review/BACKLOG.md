# Review Backlog

_Last reviewed: 2026-02-21 cycle 5. Files reviewed: `.fir/skills/e2e/mockserver/main.go`, `.fir/skills/e2e/mockserver/main_test.go`, `.gitignore`. Build: passing. Tests: 18/18 pass._

---

## Simplification

_(No open items — unused `index int` params in `sseChunk`/`sseChunkFinal` were removed 2026-02-21 in commit 7354f52.)_

## Security

_(No issues found in current code surface.)_

## Test Coverage

_(No open items — `main_test.go` added 2026-02-21 with 18 table-driven tests. **Note:** file is currently invisible to git due to the `.gitignore` bug — see URGENT.md.)_

## Correctness

_(No open items — `lastUserText`/tool-guard ordering fixed 2026-02-21.)_

## Project Hygiene

- `.gitignore:18` — `mockserver` pattern too broad; silently ignores `.fir/skills/e2e/mockserver/main_test.go`. **Escalated to URGENT.md** (2026-02-21 cycle 5). Fix: change to `/mockserver`.
- `mockserver` binary (8 MB) still exists at project root as a leftover artifact. Remove after URGENT fix lands: `rm ./mockserver`.
