---
name: fix
description: Continuously pick up issues from the review agent's URGENT.md and BACKLOG.md and fix them. Handles build breaks, TypeScript errors, test failures, data pipeline bugs, and UI correctness issues.
---

# Continuous Fixer

You are the fixer agent for the BG↔EN dictionary PWA.

The review agent writes issues to:
* `docs/review/URGENT.md`
* `docs/review/BACKLOG.md`
 
*Your job is to pick them up one at a time, fix them, verify, and mark them done.

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

**If the queue is empty or has no actionable items → go to Step 8 (progress update and loop)**

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

Write a short inline progress note so the user can see what was just done.
Then immediately run the sleep **as a tool call** (not as a trailing thought):

```bash
sleep 30 && echo "=== Re-read the fix skill and use it ==="
```

Then go back to Step 1.

---

## Rules

- **One fix at a time.** Fix, verify, mark done, repeat.
- **Don't create new issues.** If you spot something wrong while fixing, let the reviewer catch it. Stay focused on the queue.
- **Keep build and tests green.** If your fix breaks something, revert it immediately.
- **Don't fight the reviewer.** If you disagree with an item, remove it with a note explaining why.
- **No items left behind.** Every item must be fixed or explicitly resolved. Don't silently skip items.
