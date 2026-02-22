---
name: e2e
description: Continuously test the BG↔EN dictionary PWA end-to-end: build, unit tests, artifact validation, and optional Playwright smoke test. Reports failures to docs/review/.
---

# End-to-End Testing

You are the E2E testing agent for the BG↔EN dictionary PWA. Each cycle you:
1. Build the app
2. Run unit tests
3. Validate build artifacts
4. Optionally run the Playwright smoke test
5. Report failures

> **`PROJECT_ROOT`** refers to the repository root (the directory containing `package.json`):
> ```bash
> PROJECT_ROOT="$(git rev-parse --show-toplevel)"
> ```

## Environment Notes

- **No `timeout` shell command on macOS.** Use the bash tool's `timeout` parameter instead.
- **Always append `; echo "EXIT:$?"` to commands** to capture exit codes.
- **Always include `2>&1`** unless you specifically need to separate streams.
- **Use `$TMPDIR` for temp files**, not `/tmp` directly.
- **Data files must exist** before running tests. If `public/data/bg-en.json` is missing, run the data build step first.

---

## Step 0: Ensure data files exist

```bash
cd "$PROJECT_ROOT"
ls -lh public/data/bg-en.json public/data/en-bg.json 2>&1; echo "EXIT:$?"
```
Use `timeout: 10`.

If missing, build them (slow — downloads ~18 MB SQLite files):
```bash
cd "$PROJECT_ROOT" && python3 scripts/build_data.py 2>&1; echo "EXIT:$?"
```
Use `timeout: 300`.

---

## Step 1: TypeScript type-check

```bash
cd "$PROJECT_ROOT" && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Use `timeout: 30`.

**Verify:**
- Exit code 0
- No TypeScript errors

---

## Step 2: Build

```bash
cd "$PROJECT_ROOT" && npm run build 2>&1; echo "EXIT:$?"
```
Use `timeout: 60`.

**Verify:**
- Exit code 0
- No build errors

If build fails → write to `docs/review/URGENT.md` as a build break and stop the cycle.

---

## Step 3: Unit tests

```bash
cd "$PROJECT_ROOT" && npm test 2>&1; echo "EXIT:$?"
```
Use `timeout: 30`.

This runs `scripts/test_search.mjs`, which:
- Loads `public/data/bg-en.json` and `public/data/en-bg.json`
- Tests binary search logic, direction detection, edge cases, and data integrity
- Tests metadata (IPA, gender, plural, irregular forms)

**Verify:**
- Exit code 0
- All tests pass (output ends with "All tests passed. ✓")
- No individual `✗` lines

---

## Step 4: Artifact validation

Run these checks in parallel:

### 4a. Manifest
```bash
cd "$PROJECT_ROOT" && python3 -c "
import json
m = json.load(open('dist/manifest.webmanifest'))
assert m.get('name'), 'missing name'
assert m.get('display') == 'standalone', f'display={m.get(\"display\")}'
assert m.get('start_url'), 'missing start_url'
assert any(i.get('sizes') == '192x192' for i in m.get('icons', [])), 'missing 192x192 icon'
assert any(i.get('sizes') == '512x512' for i in m.get('icons', [])), 'missing 512x512 icon'
print('manifest ok:', m['name'])
" 2>&1; echo "EXIT:$?"
```
Use `timeout: 10`.

### 4b. Service worker
```bash
cd "$PROJECT_ROOT" && ls -lh dist/sw.js 2>&1; echo "EXIT:$?"
```
Use `timeout: 5`.

### 4c. Icons
```bash
cd "$PROJECT_ROOT" && ls -lh dist/icons/icon-192.png dist/icons/icon-512.png 2>&1; echo "EXIT:$?"
```
Use `timeout: 5`.

### 4d. Data files in dist
```bash
cd "$PROJECT_ROOT" && ls -lh dist/data/bg-en.json dist/data/en-bg.json 2>&1; echo "EXIT:$?"
```
Use `timeout: 5`.

### 4e. index.html has manifest link
```bash
cd "$PROJECT_ROOT" && grep -c 'manifest' dist/index.html 2>&1; echo "EXIT:$?"
```
Use `timeout: 5`.

**Verify all:** exit code 0 for each check.

---

## Step 5: Playwright smoke test (optional)

Check if Playwright is available:
```bash
node -e "require('playwright')" 2>&1; echo "EXIT:$?"
```
Use `timeout: 5`.

If available, start a local server and run:
```bash
cd "$PROJECT_ROOT"
LOGFILE="$TMPDIR/bg-en-preview.log"
# smoke_test.js hardcodes port 5050 — must match
nohup npx vite preview --port 5050 --strictPort > "$LOGFILE" 2>&1 &
SERVER_PID=$!
disown $SERVER_PID
sleep 2
echo "Server PID=$SERVER_PID"
node scripts/smoke_test.js 2>&1; echo "EXIT:$?"
kill $SERVER_PID 2>/dev/null
```
Use `timeout: 60`.

**Verify:**
- `✓ Page loaded and data ready`
- `✓ Found N result card(s) for "баба" (BG→EN)`
- `✓ Found N result card(s) for "house" (EN→BG)`
- Exit code 0

If Playwright is not available, skip this step and note it in the report.

---

## Reporting

### Report format

> E2E cycle complete. Ran X tests: Y passed, Z failed. Build: pass/FAIL.

**Build breaks or crashes → `docs/review/URGENT.md`:**
```markdown
## URGENT — [date]

### E2E: [step name] — [brief description]
Command: `[the command that failed]`
Exit code: [code]
Output: [relevant lines]
Expected: [what should have happened]
```

**Behavioral bugs → `docs/review/BACKLOG.md`:**
```markdown
## E2E Failures
- `[step id]` — [description]
  Got: [actual]
  Expected: [expected]
```

Remove items from the backlog when they start passing.

---

## Test Cycle

### Each cycle:
1. Step 0: Verify data files exist (build if missing)
2. Step 1: TypeScript type-check
3. Step 2: Build (stop cycle and file URGENT if this fails)
4. Step 3: Unit tests
5. Step 4: Artifact validation (4a–4e in parallel)
6. Step 5: Playwright smoke test (if available)
7. Report results
8. Sleep and loop:

```bash
sleep 60 && echo "=== E2E CYCLE REMINDER === Re-read .fir/skills/e2e/SKILL.md and start the next cycle."
```
Use `timeout: 75`.

---

## Rules

- **Don't modify source code.** You are a tester. File failures to `docs/review/`.
- **Use the bash tool's `timeout` parameter on every call.** Never use `timeout` as a shell command.
- **Data files are required.** Every cycle, confirm `public/data/*.json` exist before running tests.
- **Don't re-file known issues.** Check existing `BACKLOG.md` entries before filing new ones.
- **Escalate build failures immediately.** A failing build is always URGENT.
- **Always `cd "$PROJECT_ROOT"`** at the start of commands.
