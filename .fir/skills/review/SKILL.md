---
name: review
description: Continuously review code changes in the BG↔EN dictionary PWA. Checks TypeScript, CSS, data pipeline, and test coverage. Files issues to docs/review/ for the fix agent.
---

# Continuous Code Review

You are the reviewing agent for the BG↔EN dictionary PWA. Your job is to review code changes, catch bugs and quality issues, file them to `docs/review/`, and loop.

## Before Each Review Cycle

1. **Find what changed since last review:**
   ```bash
   # Staged changes
   git diff --cached --name-only

   # Unstaged changes
   git diff --name-only

   # Recently modified files (last 10 minutes)
   find src/ scripts/ -name "*.ts" -o -name "*.mjs" -o -name "*.py" -o -name "*.css" -o -name "*.html" | xargs ls -lt 2>/dev/null | awk '$6" "$7" "$8 > "'"$(date -v-10M '+%b %e %H:%M')"'" {print $NF}'
   ```

2. **Check build and test health:**
   ```bash
   npx tsc --noEmit 2>&1
   npm test 2>&1 | tail -20
   ```

## What to Review

For each changed file, read it fully and evaluate:

### 1. Correctness
- **`src/search.ts`** — binary search (`lowerBound`) must be correct; off-by-one means missing results. `searchPrefix` and `lookupExact` must scan forward correctly. `detectDirection` must match the Cyrillic Unicode range `\u0400-\u04FF`.
- **`scripts/test_search.mjs`** — tests replicate `src/search.ts` logic in Node. If `test_search.mjs` diverges from `search.ts` logic, that's a bug in one or the other.
- **`scripts/build_data.py`** — the SQL query must correctly group entries, deduplicate senses, and extract POS from `lexentry`. Sort must be case-insensitive (`casefold()`). Output JSON must match the `DictData` interface.
- **`src/main.ts`** — event listeners must be correctly attached. `runSearch()` must use the right direction. Rendering must escape HTML (`escHtml`).
- **`vite.config.ts`** — `base` must be `'./'` for GitHub Pages subdirectory deploys. PWA manifest must have correct `start_url` and `icons`.

### 2. Security / Data Integrity
- **XSS**: any user-visible string rendered into `innerHTML` must be HTML-escaped. Check `escHtml()` is called on `written_rep`, `trans_list`, `sense_list`, `pos` wherever they appear in the DOM.
- **Data file integrity**: `public/data/*.json` entries must be 4-element arrays. Spot-check in tests.
- **Fetch errors**: `loadDictionary` must handle failed fetches gracefully (show error status, not crash).

### 3. Test Coverage
- `scripts/test_search.mjs` should cover: direction detection, BG→EN prefix search, EN→BG prefix search, case insensitivity, edge cases (empty, whitespace, unknown word, maxResults), and data integrity (entry count, format, sorted order, metadata).
- Any new function added to `src/search.ts` should have corresponding test coverage.
- If a bug was fixed, a regression test should be added.

### 4. Simplification
- Dead code or unused exports in `src/search.ts` or `src/main.ts`
- Redundant DOM queries (elements should be queried once at module level)
- CSS that can be simplified with custom properties or `@media` consolidation
- Python build script: unnecessary loops, inefficient SQL queries

### 5. PWA / Deployment
- `dist/manifest.webmanifest` must have valid icons, `display: standalone`, correct `start_url`
- Service worker (`dist/sw.js`) must be generated
- Data files must be in `dist/data/` (not just `public/data/`)
- GitHub Actions workflow (`.github/workflows/deploy.yml`) must run `python3 scripts/build_data.py` before `npm run build`

## How to Report

**MANDATORY: All findings MUST be written to `docs/review/`. Chat output alone is not enough — the fix agent only reads these files.**

### Immediate action needed (build breaks, data loss, XSS):
`docs/review/URGENT.md`:
```markdown
## URGENT — [date]

### [file:line] — Brief title
Description and how to fix it.
```

### Non-urgent improvements:
`docs/review/BACKLOG.md`, grouped by category:
```markdown
_Last reviewed: [date]. Files reviewed: [...]. Build: passing/failing. Tests: N/N pass._

## Correctness
- `src/search.ts:42` — description

## Security
- ...

## Test Coverage
- ...

## Simplification
- ...
```

### Clear resolved items:
Remove fixed items from both files.

## Review Loop

1. **Print the next reminder command** as a plain code block before starting work:
   ```
   Next reminder: sleep 120 && echo "=== REVIEW CYCLE REMINDER ==="
   ```

2. **Re-read this skill file** to prevent instruction drift:
   `.fir/skills/review/SKILL.md`

3. **Run the "Before Each Review Cycle" steps**, review changed files, update `URGENT.md` and `BACKLOG.md`.

4. **Summarize**: "Reviewed N files. Found X urgent, Y backlog items. Build: passing/failing."

5. **Run the reminder command:**
   ```bash
   sleep 120 && echo "=== REVIEW CYCLE REMINDER === Re-read .fir/skills/review/SKILL.md and run the next cycle."
   ```
   Use `timeout: 135`. When you see the reminder, immediately re-read this file and repeat.

## Key Principles

- **Don't modify code yourself.** Write findings to `docs/review/` only.
- **Be specific.** Always include `file:line` references.
- **Prioritize.** Build breaks > XSS > data corruption > correctness > test gaps > simplification.
- **Don't re-file resolved items.** Read both review files before filing to avoid duplicates.
- **Key files to watch:**
  - `src/search.ts` — core search logic
  - `src/main.ts` — UI and PWA logic
  - `src/style.css` — styling
  - `index.html` — markup
  - `scripts/build_data.py` — data pipeline
  - `scripts/test_search.mjs` — unit tests
  - `vite.config.ts` — build configuration
  - `.github/workflows/deploy.yml` — CI/CD
