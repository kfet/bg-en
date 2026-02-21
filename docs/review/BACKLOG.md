# Review Backlog

_Last reviewed: 2026-02-21 cycle 4. Files reviewed: `.fir/skills/e2e/mockserver/main.go`, `.fir/skills/e2e/mockserver/main_test.go`. Build: passing. Tests: 18/18 pass._

---

## Simplification

_(No open items — unused `index int` params in `sseChunk`/`sseChunkFinal` were removed 2026-02-21.)_

## Security

_(No issues found in current code surface.)_

## Test Coverage

_(No open items — `main_test.go` added 2026-02-21 with 18 table-driven tests covering `lastUserText`, `toolSet`, `chunkString`, `sseChunk`, `sseChunkFinal`. All pass.)_

## Correctness

_(No open items — `lastUserText`/tool-guard ordering fixed 2026-02-21.)_

## Project Hygiene

- `go.mod` at project root (`module bg-en`, `go 1.25.0`) is **untracked** — not staged or committed. Other agents will not see it until it's committed. Consider `git add go.mod && git commit -m "chore: add go.mod"`.
- `mockserver` binary (8 MB) exists at project root — was built without `-o ./bin/` flag. The `.gitignore` does not cover Go binary outputs. Add `bin/` and a stray-binary pattern to `.gitignore` to prevent accidental commits. The e2e skill builds to `./bin/mock-e2e-server`; a root-level `mockserver` file is just a leftover artifact.
