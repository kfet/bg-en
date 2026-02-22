---
name: monitor
description: Continually monitor the BG↔EN dictionary PWA for code changes, build health, and test status. Reports changes to the user on each cycle.
---

# Monitor Skill

Continually monitor the BG↔EN dictionary PWA for changes and build health.

## What to Monitor

- Modified source files in `src/`, `scripts/`, `index.html`, `vite.config.ts`
- Build status (`npx tsc --noEmit`, `npm run build`)
- Test status (`npm test`)
- Data file presence (`public/data/*.json`)

## Monitoring Loop

Each cycle:

### Step 1: Run the snapshot command

```bash
cd "$(git rev-parse --show-toplevel)" && \
echo "=== SNAPSHOT @ $(date '+%H:%M:%S') ===" && \
echo "--- Modified (last 3 min) ---" && \
find src/ scripts/ -name "*.ts" -o -name "*.mjs" -o -name "*.py" -o -name "*.css" -o -name "*.html" 2>/dev/null | xargs ls -lt 2>/dev/null | awk -v cutoff="$(date -v-3M '+%H:%M')" '$8 >= cutoff {print $NF}' | head -20 && \
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
- **Files changed**: list them and note which part of the app they affect
- **TypeScript errors**: report the error lines — likely a build is in progress
- **Test failures**: highlight which assertions failed
- **Data files missing**: warn — `npm test` and the dev server will fail without them
- **Build errors**: flag as likely active work; note if they persist across cycles

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
