# Review Backlog

_Last reviewed: 2026-02-21 cycle 4. Files reviewed: `.fir/skills/e2e/mockserver/main.go`. Build: passing (`go vet` clean)._

---

## Simplification

- `.fir/skills/e2e/mockserver/main.go:298` — `sseChunk(id string, index int, ...)` declares an `index int` parameter that is never used in the function body (`sseChoice.Index` is hardcoded to `0`). Remove or use it.
- `.fir/skills/e2e/mockserver/main.go:317` — `sseChunkFinal(id string, index int, ...)` has the same issue: the `index int` parameter is declared but never referenced. Both call-sites pass a literal integer that has no effect.

## Security

_(No issues found in current code surface.)_

## Test Coverage

_(No issues.)_

## Correctness

_(No issues.)_


