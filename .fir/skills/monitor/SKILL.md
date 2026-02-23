---
name: monitor
description: Continually monitor the BG↔EN dictionary PWA for code changes, build health, and test status. Reports changes to the user on each cycle.
---

# Monitor Skill

Continually monitor the BG↔EN dictionary PWA for changes and build health.

## What to Monitor

- **Git status**: uncommitted changes to any tracked file (`git status --short`)
- **Recent commits**: new commits since the last cycle (`git log --oneline -5`)
- Build status (`npx tsc --noEmit`)
- Test status (`npm test`)
- Data file presence (`public/data/*.json`)

## Monitoring Loop

Each cycle:

### Step 1: Run the snapshot command

```bash
cd "$(git rev-parse --show-toplevel)" && \
echo "=== SNAPSHOT @ $(date '+%H:%M:%S') ===" && \
echo "--- Git status (uncommitted changes) ---" && \
git status --short && \
echo "--- Recent commits (last 5) ---" && \
git log --oneline -5 && \
echo "--- Build ---" && \
npx tsc --noEmit 2>&1 | tail -5 && \
echo "--- Tests ---" && \
npm test 2>&1 | tail -8 && \
echo "--- Data files ---" && \
ls -lh public/data/*.json 2>/dev/null || echo "MISSING: public/data/*.json" && \
echo "" && \
echo ">>> Re-read .fir/skills/monitor/SKILL.md and continue the monitoring loop."
```

Use `timeout: 60` on the bash call.

### Step 2: Report and loop

After the snapshot completes:
1. Analyze and report to the user (see **Reporting Style** below).
2. Immediately re-read this skill file and run:

```bash
sleep 30 && echo "=== MONITOR REMINDER === Re-read .fir/skills/monitor/SKILL.md and run the next snapshot."
```
Use `timeout: 45`.

## Reporting Style

- **No changes, build passing, tests passing**: "No changes. Build ✓ Tests ✓"
- **Uncommitted files** (`git status` shows M/A/?? lines): list them with their status and note which part of the app they affect
- **New commits since last cycle**: show the commit hash + message and note what changed
- **TypeScript errors**: report the error lines — likely a build is in progress
- **Test failures**: highlight which assertions failed
- **Data files missing**: warn — `npm test` and the dev server will fail without them
- **Build errors**: flag as likely active work; note if they persist across cycles

**Between cycles, keep a mental note of the last seen `git log` top commit hash so you can detect new commits on the next cycle.**

## Key Files

| File | Purpose |
|------|---------|
| `src/search.ts` | Binary search, data loading, direction detection |
| `src/main.ts` | UI, event handlers, PWA logic |
| `src/style.css` | All styles (light + dark mode) |
| `index.html` | App markup |
| `scripts/build_data.py` | WikiDict → JSON data pipeline |
| `scripts/test_search.mjs` | Unit tests (run via `npm test`) |
| `vite.config.ts` | Build + PWA configuration |
| `public/data/bg-en.json` | BG→EN dictionary data (not committed) |
| `public/data/en-bg.json` | EN→BG dictionary data (not committed) |
