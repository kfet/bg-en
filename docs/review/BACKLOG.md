# Review Backlog

_Last reviewed: 2026-02-21 cycle 8. Files reviewed: `.fir/skills/e2e/mockserver/main.go`, `main_test.go`. Build: passing. Tests: 25/25 pass. Working tree clean._

---

## Simplification

_(No open items.)_

## Security

_(No issues found in current code surface.)_

## Test Coverage

_(No open items — `TestHandleCompletions` added 2026-02-21 with 7 subtests covering: malformed JSON (400), plain text default, tool-result round-trip (MOCK_TOOL_DONE), READ_FILE/WRITE_FILE/RUN_BASH dispatch, and keyword-without-tool fallthrough. 25/25 tests pass.)_

## Correctness

_(No open items — `os.WriteFile` error now checked and fatal in `main.go`, fixed 2026-02-21.)_

## Project Hygiene

_(No open items.)_
