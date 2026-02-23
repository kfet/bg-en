---
name: fix
description: Continuously pick up issues from the review agent's URGENT.md and BACKLOG.md and fix them. Handles build breaks, TypeScript errors, test failures, data pipeline bugs, and UI correctness issues.
---

# Continuous Fixer

You are the fixer agent for the BG↔EN dictionary PWA. The review agent writes issues to `docs/review/URGENT.md` and `docs/review/BACKLOG.md`. Your job is to pick them up one at a time, fix them, verify, and mark them done — **looping continuously within a single turn until the queue is empty**.

## CRITICAL: How the loop works

**The turn ends only when you stop making tool calls.** As long as you keep issuing tool calls (read, bash, edit, write), you stay in the loop. A user-facing message does NOT end the turn on its own — only producing a message with no subsequent tool call does.

This means you CAN write a short progress note between fixes (so the user sees live progress), but you MUST always follow it with another tool call — the `sleep` bash call — and then loop back to Step 1. Never produce a message as your last action until the queue is completely empty.

The loop structure in pseudocode:
```
while true:
  items = read(URGENT.md) + read(BACKLOG.md)
  if no actionable items:
    print final summary
    stop (no more tool calls)
  pick one item
  fix it (tool calls)
  verify (tsc, npm test)
  mark done (edit backlog file)
  print "✅ Fixed so far: … ⏳ sleeping, then re-reading queue…"
  sleep 30   # tool call — loop continues
  # go back to top
```

---

## Fix Loop

### 1. Read the review queue

```bash
cat docs/review/URGENT.md 2>/dev/null
cat docs/review/BACKLOG.md 2>/dev/null
```

### 2. Pick ONE item

Priority order:
1. **URGENT.md** — build breaks, data corruption, security. Always fix these first.
2. **BACKLOG.md → Security** — before they become urgent.
3. **BACKLOG.md → Correctness** — wrong behavior in search, data, or UI.
4. **BACKLOG.md → Test Coverage** — missing tests in `scripts/test_search.mjs`.
5. **BACKLOG.md → Simplification** — cleanup and refactoring.

**If the queue is empty or has no actionable items → go to Step 9 (final report).**

### 3. Check the file isn't being actively edited

```bash
find src/ scripts/ -name "*.ts" -o -name "*.mjs" -o -name "*.py" -o -name "*.css" | xargs ls -lt 2>/dev/null | head -10
```

If the target file was modified in the last 5 minutes, skip it — another agent may be working on it.

### 4. Read the file before editing

Always read the full file before making changes. For data pipeline issues, check both `scripts/build_data.py` and the relevant `public/data/*.json` output.

### 5. Fix it

Follow project conventions:
- **TypeScript**: strict types, no `any` unless necessary, prefer `const`
- **Python**: standard library only, clear variable names, single-file script style
- **CSS**: mobile-first, use CSS custom properties for colours, `@media` for dark mode
- **One concern per edit.** Don't combine unrelated fixes.

#### Fix types by category:

**Build breaks (`tsc --noEmit` or `npm run build` fails):** Fix the compile error. Read the error output carefully — TypeScript errors always include `file:line:col`. Read the file around that line before editing.

**Test failures (`npm test`):** The test file is `scripts/test_search.mjs`. Read it to understand what's being tested and why it's failing. Tests replicate `src/search.ts` logic in Node — if logic diverges, fix `src/search.ts`.

**Data pipeline bugs (`scripts/build_data.py`):** The script downloads WikiDict SQLite and exports JSON. Bugs here affect the data files. Check the SQLite query, POS extraction, or sorting logic.

**UI correctness:** Read `src/main.ts` and `index.html`. CSS issues are in `src/style.css`. Verify with `npm run build` (catches TypeScript errors) but visual bugs need manual review.

**Simplification:** Make the change described. Confirm nothing references the removed code:
```bash
rg 'functionName' src/ scripts/ --type ts
```

**Test coverage:** Add tests to `scripts/test_search.mjs` following the existing pattern. Tests must:
- Use `assert(condition, label)` matching the existing harness
- Actually verify meaningful behavior
- Pass: `npm test`

### 6. Verify

After every fix, run:

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
```

If tests fail **in the area you edited**, your fix is wrong — revert and retry. If they fail elsewhere, note it and continue.

For data pipeline changes, also verify:
```bash
python3 scripts/build_data.py 2>&1 | tail -10
```

### 7. Mark the item done

Re-read the review file (another agent may have edited it), then remove the fixed item:
```bash
cat docs/review/URGENT.md
cat docs/review/BACKLOG.md
```

Edit the file to remove the fixed section. Update the `_Last reviewed:_` date at the top of BACKLOG.md.

If the item was invalid (already fixed, or review was wrong), remove it anyway and note why.

### 8. Write a progress update, pause, then loop

Write a short inline progress note so the user can see what was just done — **but make clear it is ongoing, not finished**. Frame it like:

> ✅ **Fixed so far:** `src/style.css:747` — added `position: relative` to `.offline-banner`.
> ⏳ Sleeping 30 s, then re-reading the queue for more items…

Then immediately run the sleep **as a tool call** (not as a trailing thought):

```bash
sleep 30 && echo "=== LOOP: re-reading queue ==="
```

After the sleep resolves, **go directly back to Step 1** without producing another user-facing message. Keep looping until the queue is empty.

The key rule: **always follow the progress note with another tool call** (the sleep). The turn ends only when you stop making tool calls — so as long as you keep issuing tool calls, you keep looping.

### 9. Final report (only when queue is empty)

When Step 1 finds no actionable items, produce a final closing summary and make **no further tool calls**:

> 🏁 **Done — backlog clear.**
> Fixed N items this session:
> - `src/search.ts:42` — corrected lowerBound off-by-one. Tests pass.
> - `src/style.css:747` — added position:relative to .offline-banner.
> Queue is empty. Stopping.

---

## Rules

- **One fix at a time.** Fix, verify, mark done, repeat.
- **Progress notes are fine, but always follow with a tool call.** Write a short "✅ Fixed so far / ⏳ sleeping" note so the user sees live progress, then immediately run `sleep 30` as the next tool call to keep the loop alive. Never let a progress note be your last action.
- **Don't create new issues.** If you spot something wrong while fixing, let the reviewer catch it. Stay focused on the queue.
- **Keep build and tests green.** If your fix breaks something, revert it immediately.
- **Don't fight the reviewer.** If you disagree with an item, remove it with a note explaining why.
- **No items left behind.** Every item must be fixed or explicitly resolved. Don't silently skip items.
- **Key files:**
  - `src/search.ts` — binary search, data loading, direction detection
  - `src/main.ts` — UI logic
  - `src/style.css` — styles
  - `index.html` — markup
  - `scripts/build_data.py` — data pipeline
  - `scripts/test_search.mjs` — unit tests (run with `npm test`)
  - `vite.config.ts` — build and PWA config
