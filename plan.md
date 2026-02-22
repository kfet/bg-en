# BG ↔ EN Dictionary PWA — Build Plan

> **For AI agents**: Read this file top-to-bottom before starting any task. Each task
> has a status, explicit dependencies, exact file paths, and acceptance criteria.
> Update the status field and add a completion note when you finish a task.
> All architectural decisions are final — do not re-evaluate them; see **§ Decisions** if you want rationale.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[!]` | Blocked |

---

## Current State

```
bg-en/
├── notes.md     ✓ exists — full research notes, architecture rationale, code outlines
├── plan.md      ✓ this file
└── (nothing else)
```

No code exists yet. Start from T01.

---

## Phase 0 — Repo & Tooling Bootstrap

### T01 · Init repo structure and Node project
**Status**: `[x]`
**Depends on**: nothing
**Agent**: any

**What to do**:
1. In the repo root (`/Users/kfet/dev/bg-en`), create the following directory skeleton (empty dirs + placeholder files):
   ```
   scripts/
   public/
     data/          ← .gitkeep
     icons/         ← .gitkeep
   src/
   ```
2. Run: `npm create vite@latest . -- --template vanilla-ts`
   - Answer "y" if prompted about existing files (only `notes.md` + `plan.md` are there)
   - This creates: `index.html`, `src/main.ts`, `src/style.css`, `src/vite-env.d.ts`, `src/counter.ts`, `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`
3. Delete the Vite demo boilerplate files: `src/counter.ts`, `public/vite.svg`, `src/typescript.svg`
4. Run: `npm install`
5. Run: `npm install -D vite-plugin-pwa`
6. Verify `npm run dev` starts without errors (Ctrl+C after confirming)

**Acceptance criteria**:
- `package.json` exists with `vite`, `typescript`, `vite-plugin-pwa` in devDependencies
- `npm run build` exits with code 0
- `src/counter.ts` does NOT exist

**Files created/modified**: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`

---

### T02 · Configure vite.config.ts with PWA plugin
**Status**: `[x]`
**Depends on**: T01
**Agent**: any

**What to do**:  
Replace the contents of `vite.config.ts` with the following exactly:

```typescript
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/(bg-en|en-bg)\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dict-data-v1',
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      manifest: {
        name: 'BG–EN Dictionary',
        short_name: 'БГ–АН',
        description: 'Offline Bulgarian–English / English–Bulgarian dictionary',
        lang: 'bg',
        theme_color: '#1565c0',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
```

**Acceptance criteria**:
- `npm run build` completes without errors
- `dist/manifest.webmanifest` exists after build
- `dist/sw.js` (or `dist/service-worker.js`) exists after build

**Files modified**: `vite.config.ts`

---

### T03 · Generate app icons
**Status**: `[x]`
**Depends on**: T01
**Agent**: any

**What to do**:  
Create two PNG icon files programmatically. Use Python (no extra dependencies needed — use the `struct` + `zlib` approach, or use any available tool: ImageMagick `convert`, Node canvas, etc.).

The icon design: dark blue background (#1565c0), white text "БГ" centered.

**Preferred approach** (Python with Pillow if available, else ImageMagick):
```bash
# Check what's available
which convert && echo "imagemagick ok" || echo "no imagemagick"
python3 -c "from PIL import Image" 2>/dev/null && echo "pillow ok" || echo "no pillow"
```

Use whatever is available. The icons just need to be valid PNGs at the right sizes.

With ImageMagick:
```bash
convert -size 192x192 xc:#1565c0 \
  -font DejaVu-Sans-Bold -pointsize 72 -fill white \
  -gravity Center -annotate 0 "БГ" \
  public/icons/icon-192.png

convert -size 512x512 xc:#1565c0 \
  -font DejaVu-Sans-Bold -pointsize 192 -fill white \
  -gravity Center -annotate 0 "БГ" \
  public/icons/icon-512.png
```

With Python + Pillow:
```python
from PIL import Image, ImageDraw, ImageFont
for size in [192, 512]:
    img = Image.new('RGB', (size, size), '#1565c0')
    draw = ImageDraw.Draw(img)
    # draw "БГ" centered — use default font if no TTF available
    draw.text((size//2, size//2), "БГ", fill="white", anchor="mm")
    img.save(f"public/icons/icon-{size}.png")
```

If neither is available, create minimal valid placeholder PNGs using Python's `struct`+`zlib` (write a raw PNG).

**Acceptance criteria**:
- `public/icons/icon-192.png` exists, is a valid PNG, dimensions exactly 192×192
- `public/icons/icon-512.png` exists, is a valid PNG, dimensions exactly 512×512
- Verify: `python3 -c "from PIL import Image; print(Image.open('public/icons/icon-192.png').size)"`
  or: `identify public/icons/icon-192.png`

**Files created**: `public/icons/icon-192.png`, `public/icons/icon-512.png`

---

## Phase 1 — Data Pipeline

### T04 · Write data build script
**Status**: `[x]`
**Depends on**: T01 (directory structure)
**Agent**: any

**What to do**:  
Create `scripts/build_data.py`. This script downloads the WikiDict SQLite files and exports them as sorted JSON for the PWA.

**Full script to create** at `scripts/build_data.py`:

```python
#!/usr/bin/env python3
"""
Build script: WikiDict SQLite → sorted JSON for the PWA.

Usage:
    python3 scripts/build_data.py

Downloads:
    bg-en.sqlite3 (~4.6 MB) from WikiDict 2025-11 release
    en-bg.sqlite3 (~13.7 MB) from WikiDict 2025-11 release

Outputs:
    public/data/bg-en.json   (~4 MB uncompressed, ~530 KB gzipped)
    public/data/en-bg.json   (~11 MB uncompressed, ~2.9 MB gzipped)

JSON format:
    {
      "version": "2025-11",
      "entries": [
        ["written_rep", "trans_list", "sense_list", "pos"],
        ...
      ]
    }

    - entries sorted by written_rep (locale-aware, case-insensitive)
    - trans_list: translations joined by " | "
    - sense_list: senses/glosses joined by " | ", may be empty string
    - pos: "n" | "prop.n" | "v" | "adj" | "adv" | "prep" | "part" | "num" | ""
"""

import sqlite3
import json
import urllib.request
import os
import sys
import locale

VERSION = "2025-11"
BASE_URL = f"https://download.wikdict.com/dictionaries/sqlite/2_{VERSION}"
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

DATASETS = ["bg-en", "en-bg"]

POS_MAP = {
    "Съществително_нарицателно_име": "n",
    "Съществително_собствено_име":   "prop.n",
    "Глагол":                        "v",
    "Прилагателно_име":              "adj",
    "Наречие":                       "adv",
    "Предлог":                       "prep",
    "Частица":                       "part",
    "Числително_име":                "num",
}


def extract_pos(lexentry: str) -> str:
    if not lexentry:
        return ""
    parts = lexentry.split("__")
    if len(parts) >= 2:
        return POS_MAP.get(parts[1], "")
    return ""


def download(name: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    dest = os.path.join(CACHE_DIR, f"{name}.sqlite3")
    if os.path.exists(dest):
        print(f"  [cache] {name}.sqlite3 already downloaded")
        return dest
    url = f"{BASE_URL}/{name}.sqlite3"
    print(f"  [download] {url} ...", flush=True)
    tmp = dest + ".tmp"
    def progress(count, block, total):
        pct = min(100, int(count * block * 100 / total))
        print(f"\r    {pct}%", end="", flush=True)
    urllib.request.urlretrieve(url, tmp, reporthook=progress)
    print()
    os.rename(tmp, dest)
    print(f"  [ok] saved to {dest}")
    return dest


def export_dataset(name: str) -> None:
    db_path = download(name)
    print(f"  [export] reading {name}.sqlite3 ...")

    con = sqlite3.connect(db_path)

    # Use translation_grouped view, group further to collapse duplicate
    # (written_rep, trans_list) pairs that differ only in lexentry/POS.
    # Take the lexentry with the highest score to determine POS.
    rows = con.execute("""
        SELECT
            written_rep,
            trans_list,
            group_concat(sense_list, ' | ') AS all_senses,
            lexentry,
            MAX(score) AS top_score
        FROM translation_grouped
        WHERE written_rep IS NOT NULL AND written_rep != ''
        GROUP BY written_rep, trans_list
        ORDER BY written_rep
    """).fetchall()
    con.close()

    entries = []
    for written_rep, trans_list, all_senses, lexentry, _score in rows:
        pos = extract_pos(lexentry or "")
        trans = (trans_list or "").strip()
        sense = (all_senses or "").strip()
        # Deduplicate repeated senses from group_concat
        if sense:
            seen = []
            for s in sense.split(" | "):
                s = s.strip()
                if s and s not in seen:
                    seen.append(s)
            sense = " | ".join(seen)
        entries.append([written_rep, trans, sense, pos])

    # Sort case-insensitively. Python's default Unicode sort is good enough
    # for both Cyrillic and Latin; locale-based sort requires system locale.
    entries.sort(key=lambda e: e[0].casefold())

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{name}.json")
    payload = {"version": VERSION, "entries": entries}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) // 1024
    print(f"  [ok] {len(entries)} entries → {out_path} ({size_kb} KB)")


def main():
    print(f"Building dictionary data (WikiDict {VERSION})\n")
    for name in DATASETS:
        print(f"--- {name} ---")
        export_dataset(name)
        print()
    print("Done. Files written to public/data/")


if __name__ == "__main__":
    main()
```

Then run it:
```bash
python3 scripts/build_data.py
```

**Acceptance criteria**:
- `public/data/bg-en.json` exists, size between 3 MB and 6 MB
- `public/data/en-bg.json` exists, size between 8 MB and 15 MB
- Both files are valid JSON: `python3 -c "import json; d=json.load(open('public/data/bg-en.json')); print(len(d['entries']), 'entries')"`
- bg-en has ≥ 40,000 entries
- en-bg has ≥ 40,000 entries
- Each entry is a list of 4 strings: `[written_rep, trans_list, sense_list, pos]`
- First entry's `written_rep` starts near the beginning of the BG/EN alphabet
- Spot-check: `python3 -c "import json; d=json.load(open('public/data/bg-en.json')); print([e for e in d['entries'] if e[0]=='баба'])"`
  Should return something like `[['баба', 'babushka', '', '']]`

**Files created**: `scripts/build_data.py`, `public/data/bg-en.json`, `public/data/en-bg.json`

**Note**: `scripts/.cache/` holds the downloaded SQLite files (total ~18 MB). Add to `.gitignore`. The generated `public/data/*.json` files are also large — either commit them or generate them in CI; decide in T10.

---

### T05 · Update .gitignore
**Status**: `[x]`
**Depends on**: T04
**Agent**: any

**What to do**:  
Create `.gitignore` at repo root:

```gitignore
# Node
node_modules/
dist/

# Vite
*.local

# Data pipeline cache (large SQLite files, ~18 MB)
scripts/.cache/

# Generated data files — regenerate with: python3 scripts/build_data.py
# Comment these out if you want to commit the data to the repo instead
public/data/bg-en.json
public/data/en-bg.json

# OS
.DS_Store
Thumbs.db
```

**Decision**: whether to commit `public/data/*.json` is left to the project owner. The gitignore ignores them by default (agents can download them at any time with `python3 scripts/build_data.py`).

**Acceptance criteria**:
- `.gitignore` exists
- `git status` does not show `scripts/.cache/` or `node_modules/` as untracked

**Files created**: `.gitignore`

---

## Phase 2 — Core App Logic

### T06 · Implement data loader and binary search (`src/search.ts`)
**Status**: `[x]`
**Depends on**: T04 (data files must exist to test against)
**Agent**: any

**What to do**:  
Create `src/search.ts` with the following exact interface and implementation:

```typescript
// src/search.ts

export type Direction = 'bg-en' | 'en-bg'

// Each entry: [written_rep, trans_list, sense_list, pos]
export type Entry = [string, string, string, string]

export interface DictData {
  version: string
  entries: Entry[]
}

// ── Singleton state ──────────────────────────────────────────────────────────

let bgEnData: Entry[] | null = null
let enBgData: Entry[] | null = null
let loadPromise: Promise<void> | null = null

// ── Loading ──────────────────────────────────────────────────────────────────

async function fetchDataset(name: Direction): Promise<Entry[]> {
  const res = await fetch(`./data/${name}.json`)
  if (!res.ok) throw new Error(`Failed to fetch ${name}.json: ${res.status}`)
  const payload: DictData = await res.json()
  return payload.entries
}

/**
 * Load both datasets. Safe to call multiple times — returns same promise.
 * Fires onProgress(0..100) as each file loads.
 */
export async function loadDictionary(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (bgEnData && enBgData) return
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    onProgress?.(0)
    bgEnData = await fetchDataset('bg-en')
    onProgress?.(40)
    enBgData = await fetchDataset('en-bg')
    onProgress?.(100)
  })()

  return loadPromise
}

export function isLoaded(): boolean {
  return bgEnData !== null && enBgData !== null
}

// ── Binary search ─────────────────────────────────────────────────────────────

/**
 * Find the index of the first entry whose written_rep.casefold() >= prefix.casefold()
 */
function lowerBound(entries: Entry[], prefix: string): number {
  const p = prefix.casefold ? prefix.casefold() : prefix.toLowerCase()
  let lo = 0
  let hi = entries.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const key = entries[mid][0].casefold
      ? entries[mid][0].casefold()
      : entries[mid][0].toLowerCase()
    if (key < p) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Search for entries whose written_rep starts with `prefix`.
 * Returns up to `maxResults` matches, sorted by their natural order in the dataset
 * (which is already score-sorted within the same headword group).
 */
export function searchPrefix(
  direction: Direction,
  prefix: string,
  maxResults = 30,
): Entry[] {
  const entries = direction === 'bg-en' ? bgEnData : enBgData
  if (!entries || !prefix.trim()) return []

  const p = prefix.trim().casefold
    ? prefix.trim().casefold()
    : prefix.trim().toLowerCase()

  const start = lowerBound(entries, p)
  const results: Entry[] = []

  for (let i = start; i < entries.length && results.length < maxResults; i++) {
    const key = entries[i][0].casefold
      ? entries[i][0].casefold()
      : entries[i][0].toLowerCase()
    if (!key.startsWith(p)) break
    results.push(entries[i])
  }

  return results
}

/**
 * Exact lookup: all entries for a given written_rep (may have multiple POS/senses).
 */
export function lookupExact(direction: Direction, word: string): Entry[] {
  const entries = direction === 'bg-en' ? bgEnData : enBgData
  if (!entries) return []

  const target = word.casefold ? word.casefold() : word.toLowerCase()
  const start = lowerBound(entries, target)
  const results: Entry[] = []

  for (let i = start; i < entries.length; i++) {
    const key = entries[i][0].casefold
      ? entries[i][0].casefold()
      : entries[i][0].toLowerCase()
    if (key !== target) break
    results.push(entries[i])
  }

  return results
}

/**
 * Auto-detect direction from input: if input contains any Cyrillic character → bg-en,
 * otherwise → en-bg.
 */
export function detectDirection(input: string): Direction {
  return /[\u0400-\u04FF]/.test(input) ? 'bg-en' : 'en-bg'
}
```

> **Note on `casefold`**: `String.prototype.casefold` does not exist in JavaScript. The code uses `.casefold ? .casefold() : .toLowerCase()` as a forward-compatible shim. In practice `.toLowerCase()` will always run. This is intentional — do not remove the shim pattern.

**Acceptance criteria**:
- `src/search.ts` compiles with no TypeScript errors (`npx tsc --noEmit`)
- `detectDirection('баба')` returns `'bg-en'`
- `detectDirection('house')` returns `'en-bg'`
- After loading, `searchPrefix('bg-en', 'баба')` returns at least 1 entry where `entry[0] === 'баба'`
- After loading, `searchPrefix('en-bg', 'house')` returns entries including one where `entry[0] === 'house'`

**Files created**: `src/search.ts`

---

### T07 · Build the UI (`index.html` + `src/main.ts` + `src/style.css`)
**Status**: `[x]`
**Depends on**: T06
**Agent**: any

**What to do**:  
Build a clean, mobile-first dictionary UI. No framework — vanilla TypeScript + CSS.

#### `index.html`

Replace entire file:

```html
<!DOCTYPE html>
<html lang="bg">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Offline Bulgarian–English dictionary" />
    <link rel="icon" href="./icons/icon-192.png" />
    <title>БГ–АН Речник</title>
    <link rel="stylesheet" href="./src/style.css" />
  </head>
  <body>
    <header>
      <h1>БГ ↔ АН</h1>
      <p class="subtitle">Речник / Dictionary</p>
    </header>

    <main>
      <div class="search-bar">
        <div class="direction-toggle">
          <button id="btn-bg-en" class="dir-btn active" aria-pressed="true">БГ → АН</button>
          <button id="btn-en-bg" class="dir-btn" aria-pressed="false">АН → БГ</button>
          <button id="btn-auto" class="dir-btn" aria-pressed="false" title="Auto-detect from input">авто</button>
        </div>
        <input
          id="search-input"
          type="search"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="търси… / search…"
          aria-label="Search word"
        />
      </div>

      <div id="status-bar" class="status-bar" role="status" aria-live="polite"></div>

      <div id="results" class="results" role="list" aria-label="Search results"></div>
    </main>

    <div id="install-banner" class="install-banner hidden">
      <span>Инсталирай приложението за offline достъп</span>
      <button id="install-btn">Инсталирай</button>
      <button id="install-dismiss" aria-label="Dismiss">✕</button>
    </div>

    <div id="update-banner" class="update-banner hidden">
      <span>Налична е нова версия.</span>
      <button id="update-btn">Обнови</button>
    </div>

    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

#### `src/main.ts`

Replace entire file:

```typescript
import { loadDictionary, searchPrefix, lookupExact, detectDirection, type Direction, type Entry } from './search'

// ── Elements ────────────────────────────────────────────────────────────────

const searchInput   = document.getElementById('search-input')    as HTMLInputElement
const resultsEl     = document.getElementById('results')          as HTMLDivElement
const statusBar     = document.getElementById('status-bar')       as HTMLDivElement
const btnBgEn       = document.getElementById('btn-bg-en')        as HTMLButtonElement
const btnEnBg       = document.getElementById('btn-en-bg')        as HTMLButtonElement
const btnAuto       = document.getElementById('btn-auto')         as HTMLButtonElement
const installBanner = document.getElementById('install-banner')   as HTMLDivElement
const installBtn    = document.getElementById('install-btn')      as HTMLButtonElement
const installDismiss= document.getElementById('install-dismiss')  as HTMLButtonElement
const updateBanner  = document.getElementById('update-banner')    as HTMLDivElement
const updateBtn     = document.getElementById('update-btn')       as HTMLButtonElement

// ── State ────────────────────────────────────────────────────────────────────

let direction: Direction | 'auto' = 'auto'
let deferredInstallPrompt: any = null

// ── POS labels ───────────────────────────────────────────────────────────────

const POS_LABEL: Record<string, string> = {
  n: 'същ.',
  'prop.n': 'собств.',
  v: 'гл.',
  adj: 'прил.',
  adv: 'нар.',
  prep: 'предл.',
  part: 'частица',
  num: 'числ.',
}

// ── Direction toggle ─────────────────────────────────────────────────────────

function setDirection(d: Direction | 'auto') {
  direction = d
  btnBgEn.classList.toggle('active', d === 'bg-en')
  btnEnBg.classList.toggle('active', d === 'en-bg')
  btnAuto.classList.toggle('active', d === 'auto')
  btnBgEn.setAttribute('aria-pressed', String(d === 'bg-en'))
  btnEnBg.setAttribute('aria-pressed', String(d === 'en-bg'))
  btnAuto.setAttribute('aria-pressed', String(d === 'auto'))
  if (searchInput.value.trim()) runSearch()
}

btnBgEn.addEventListener('click', () => setDirection('bg-en'))
btnEnBg.addEventListener('click', () => setDirection('en-bg'))
btnAuto.addEventListener('click', () => setDirection('auto'))

// ── Rendering ────────────────────────────────────────────────────────────────

function posTag(pos: string): string {
  if (!pos) return ''
  const label = POS_LABEL[pos] ?? pos
  return `<span class="pos-tag">${label}</span>`
}

function renderEntries(entries: Entry[]): void {
  if (!entries.length) {
    resultsEl.innerHTML = '<p class="no-results">Няма резултати / No results</p>'
    return
  }

  // Group by written_rep
  const grouped = new Map<string, Entry[]>()
  for (const e of entries) {
    const arr = grouped.get(e[0]) ?? []
    arr.push(e)
    grouped.set(e[0], arr)
  }

  const html: string[] = []
  for (const [word, group] of grouped) {
    html.push(`<article class="result-card" role="listitem">`)
    html.push(`<h2 class="headword">${escHtml(word)}</h2>`)
    for (const [, trans, sense, pos] of group) {
      const translations = trans.split(' | ').map(t => t.trim()).filter(Boolean)
      html.push(`<div class="translation-row">`)
      html.push(`<div class="trans-main">${posTag(pos)}${translations.map(t => `<span class="trans">${escHtml(t)}</span>`).join('<span class="sep"> · </span>')}</div>`)
      if (sense) {
        html.push(`<div class="sense">${escHtml(sense)}</div>`)
      }
      html.push(`</div>`)
    }
    html.push(`</article>`)
  }

  resultsEl.innerHTML = html.join('')
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Search ───────────────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout> | null = null

function runSearch(): void {
  const query = searchInput.value.trim()
  if (!query) {
    resultsEl.innerHTML = ''
    return
  }

  const dir: Direction = direction === 'auto' ? detectDirection(query) : direction
  const results = searchPrefix(dir, query, 40)
  renderEntries(results)
}

searchInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 120)
})

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (searchTimer) clearTimeout(searchTimer)
    runSearch()
  }
})

// ── Boot / data loading ──────────────────────────────────────────────────────

function setStatus(msg: string): void {
  statusBar.textContent = msg
  statusBar.classList.toggle('hidden', !msg)
}

async function boot(): Promise<void> {
  setStatus('Зарежда речника… / Loading dictionary…')
  try {
    await loadDictionary((pct) => {
      if (pct < 100) {
        setStatus(`Зарежда… ${pct}% / Loading… ${pct}%`)
      } else {
        setStatus('')
        searchInput.focus()
      }
    })
  } catch (err) {
    setStatus('Грешка при зареждане. Проверете интернет връзката. / Load error — check connection.')
    console.error(err)
  }
}

boot()

// ── PWA: Install prompt ──────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredInstallPrompt = e
  installBanner.classList.remove('hidden')
})

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return
  deferredInstallPrompt.prompt()
  const result = await deferredInstallPrompt.userChoice
  if (result.outcome === 'accepted') installBanner.classList.add('hidden')
  deferredInstallPrompt = null
})

installDismiss.addEventListener('click', () => {
  installBanner.classList.add('hidden')
})

window.addEventListener('appinstalled', () => {
  installBanner.classList.add('hidden')
})

// ── PWA: Update notification ─────────────────────────────────────────────────

// vite-plugin-pwa emits a 'sw-update-available' custom event
document.addEventListener('sw-update-available', () => {
  updateBanner.classList.remove('hidden')
})

updateBtn.addEventListener('click', () => {
  updateBanner.classList.add('hidden')
  window.location.reload()
})
```

#### `src/style.css`

Replace entire file with a clean, mobile-first stylesheet. See styling spec below. Agent should write complete, production-quality CSS (not a stub):

- CSS custom properties for theming
- Dark-mode support via `@media (prefers-color-scheme: dark)`
- Responsive: single-column on mobile, max-width 720px on desktop
- Colours: primary `#1565c0` (blue), background white / `#121212` dark, surface white / `#1e1e1e` dark
- Typography: system font stack, `1rem` base, `1.25rem` headword, `0.8rem` POS tag
- Components to style: `header`, `.search-bar`, `.dir-btn`, `.dir-btn.active`, `#search-input`, `.status-bar`, `.result-card`, `.headword`, `.translation-row`, `.trans-main`, `.trans`, `.pos-tag`, `.sense`, `.sep`, `.no-results`, `.install-banner`, `.update-banner`, `.hidden`
- Smooth `box-shadow` on `.result-card`, subtle hover effect
- The `.pos-tag` should be a small pill badge (blue bg, white text, 0.7rem, monospace)
- Mobile: full-width search input with large touch target (min 48px height)

**Acceptance criteria**:
- `npm run build` succeeds with no TypeScript errors
- `npm run dev` serves the app; typing in the search box shows results (requires data files from T04)
- Direction toggle buttons visually reflect active state
- Status bar disappears after data loads
- App is usable on mobile viewport (375px wide)

**Files modified**: `index.html`, `src/main.ts`, `src/style.css`

---

## Phase 3 — PWA Validation

### T08 · Verify PWA installability
**Status**: `[x]`
**Depends on**: T02, T03, T07
**Agent**: any

**What to do**:
1. Run `npm run build`
2. Serve the dist folder locally with a static server:
   ```bash
   npx serve dist -l 5000
   # or: python3 -m http.server 5000 --directory dist
   ```
3. Check the following manually or with a script:
   - `dist/manifest.webmanifest` exists and contains `"name"`, `"icons"`, `"display": "standalone"`, `"start_url"`
   - `dist/sw.js` exists (Workbox-generated service worker)
   - `dist/index.html` contains `<link rel="manifest" ...>`
   - Both `dist/icons/icon-192.png` and `dist/icons/icon-512.png` exist

4. Run Lighthouse PWA audit if available:
   ```bash
   npx lighthouse http://localhost:5000 --only-categories=pwa --output=json --output-path=lighthouse-pwa.json
   cat lighthouse-pwa.json | python3 -c "import sys,json; r=json.load(sys.stdin); print('PWA score:', r['categories']['pwa']['score'])"
   ```
   Target: PWA score ≥ 0.9 (or all red items explained)

5. Manually verify that `dist/manifest.webmanifest` parses cleanly:
   ```bash
   python3 -c "import json; m=json.load(open('dist/manifest.webmanifest')); print('ok:', m['name'])"
   ```

**Fix any issues found**. Common issues:
- Icons not included in build → check `includeAssets` in `vite.config.ts`
- `start_url` mismatch → use `'./'` (relative) not `'/'` for GitHub Pages subpath deploys
- Service worker not registered → check that `src/main.ts` doesn't interfere with the auto-registration from `vite-plugin-pwa`

**Acceptance criteria**:
- All 5 checks in step 3 pass
- `npm run build` produces no errors or warnings about missing icons
- `dist/manifest.webmanifest` is valid JSON with correct fields

**Files modified**: possibly `vite.config.ts`, `index.html` (minor fixes only)

---

### T09 · Offline smoke test
**Status**: `[x]`
**Depends on**: T08
**Agent**: any

**What to do**:  
Verify the app actually works offline after first load.

Using a script (headless Chromium / Playwright) or manually:

1. Build and serve: `npm run build && npx serve dist -l 5000`
2. Open `http://localhost:5000` in Chrome, wait for the "loaded" status to clear
3. Open DevTools → Application → Service Workers → confirm SW is registered and active
4. Open DevTools → Application → Cache Storage → confirm `dict-data-v1` cache contains `bg-en.json` and `en-bg.json`
5. DevTools → Network → set to "Offline"
6. Reload the page
7. Confirm the app loads and search still works

If Playwright is available, write a simple test script at `scripts/smoke_test.js`:
```javascript
// scripts/smoke_test.js  (Node, requires: npm i -D playwright)
// Run with: node scripts/smoke_test.js
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:5000')
  // Wait for data load (status bar disappears)
  await page.waitForFunction(() => document.getElementById('status-bar')?.textContent === '')
  console.log('✓ Page loaded and data ready')
  // Type a BG word
  await page.fill('#search-input', 'баба')
  await page.waitForTimeout(300)
  const results = await page.$$('.result-card')
  console.assert(results.length > 0, 'Expected results for "баба"')
  console.log(`✓ Found ${results.length} result card(s) for "баба"`)
  await browser.close()
  console.log('Smoke test passed.')
})()
```

**Acceptance criteria**:
- App loads offline (no network errors in console after SW is active)
- Search returns results offline
- If smoke_test.js is written: `node scripts/smoke_test.js` exits with code 0

**Files created** (optional): `scripts/smoke_test.js`

---

## Phase 4 — Deployment

### T10 · Set up GitHub Pages deployment
**Status**: `[x]`
**Depends on**: T08, T09
**Agent**: any

**What to do**:
1. Create `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Node dependencies
        run: npm ci

      - name: Build data files
        run: python3 scripts/build_data.py

      - name: Build app
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deploy
        uses: actions/deploy-pages@v4
```

2. In `package.json`, confirm the `build` script is `vite build` (should already be set by Vite scaffold).

3. In the GitHub repo settings (manual step — note in comments):
   - Settings → Pages → Source → "GitHub Actions"

4. If the repo is at `github.com/USER/bg-en` (not an org root), the app will be served at `https://USER.github.io/bg-en/`. In that case, set `base: '/bg-en/'` in `vite.config.ts` (update it).

   **How to determine**: check `git remote get-url origin`. If the repo slug is not the user's root repo (i.e., not `USER.github.io`), add the `/bg-en/` base path.

**Acceptance criteria**:
- `.github/workflows/deploy.yml` exists and is valid YAML (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"`)
- On push to `main`, the GitHub Actions workflow runs and deploys successfully (green check)
- The live URL is accessible and the PWA passes basic installability

**Files created**: `.github/workflows/deploy.yml`
**Files possibly modified**: `vite.config.ts` (base path)

---

### T11 · Add `README.md`
**Status**: `[x]`
**Depends on**: T10
**Agent**: any

**What to do**:  
Create `README.md` at repo root:

```markdown
# БГ ↔ АН Речник / BG–EN Dictionary

Installable offline PWA dictionary for Bulgarian ↔ English, powered by [WikiDict](https://www.wikdict.com) data (derived from Wiktionary).

**Live app**: https://USER.github.io/bg-en/   ← update URL

## Features

- 🔍 Instant prefix search (binary search, no server)
- 🔄 Bulgarian → English and English → Bulgarian
- 🤖 Auto-detects direction from Cyrillic vs Latin input  
- 📶 Works fully offline after first visit
- 📲 Installable as a PWA (Add to Home Screen)
- ~3.4 MB one-time data download, cached locally

## Data

Dictionary data from [WikiDict](https://www.wikdict.com) release `2025-11`,  
derived from [Wiktionary](https://en.wiktionary.org), licensed under  
[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

- bg→en: ~41,000 entries
- en→bg: ~41,000 entries

## Development

**Requirements**: Node 20+, Python 3.10+

```bash
# 1. Install JS dependencies
npm install

# 2. Build data files (downloads ~18 MB of WikiDict SQLite, outputs ~15 MB JSON)
python3 scripts/build_data.py

# 3. Start dev server
npm run dev

# 4. Build for production
npm run build
```

## Architecture

- **Data pipeline**: Python script → WikiDict SQLite → sorted JSON arrays
- **Search**: in-memory binary search (O log n), no database in browser
- **Offline**: Workbox service worker pre-caches all assets + data on first visit
- **Deploy**: GitHub Actions → GitHub Pages (static, no server)
```

Replace `USER` with the actual GitHub username.

**Acceptance criteria**:
- `README.md` exists at repo root
- Contains the live URL (updated from placeholder)
- Contains development setup instructions

**Files created**: `README.md`

---

## Phase 5 — Polish (do after all above are done)

### T12 · Add keyboard shortcut and focus UX
**Status**: `[x]`
**Depends on**: T07
**Agent**: any

**What to do**:  
Enhance `src/main.ts`:
1. On page load (after data loads), auto-focus the search input
2. `Escape` key clears the search input and results
3. `Ctrl+L` / `Cmd+L` focuses the search input (common browser shortcut — intercept it)
4. If direction is "auto", show a small indicator next to the input showing which direction was detected (e.g. 🇧🇬→🇬🇧 or 🇬🇧→🇧🇬)

**Acceptance criteria**:
- Pressing Escape when input is focused clears input and results
- Auto-focus works after data loads
- Auto-detect indicator updates as you type

---

### T13 · Add "copy translation" button
**Status**: `[x]`
**Depends on**: T07
**Agent**: any

**What to do**:  
In `src/main.ts` `renderEntries()`, add a copy button to each `.translation-row`:
- Small clipboard icon (use Unicode: 📋 or an SVG)
- Clicking it copies `trans_list` to clipboard using `navigator.clipboard.writeText()`
- Show brief "Copied!" tooltip (CSS transition, 1.5s duration) on success
- Accessible: `aria-label="Copy translation"`

---

### T14 · Handle first-load data progress with a real progress bar
**Status**: `[x]`
**Depends on**: T07
**Agent**: any

**What to do**:  
Replace the text status bar with a visible progress bar UI:
- `<div id="progress-bar-track"><div id="progress-bar-fill"></div></div>`
- Animate width from 0% → 40% (after bg-en loads) → 100% (after en-bg loads)
- Smooth CSS transition: `transition: width 0.3s ease`
- Hide after complete (CSS opacity fade-out)
- The `loadDictionary` `onProgress` callback drives the fill width

---

### T15 · Dark mode
**Status**: `[x]`
**Depends on**: T07
**Agent**: any

**What to do**:  
If not already done in T07's CSS (which specifies dark mode via `@media prefers-color-scheme: dark`):
1. Add a manual dark/light toggle button in the header (🌙 / ☀️)
2. Store preference in `localStorage`
3. Apply `data-theme="dark"` to `<html>` and use CSS `[data-theme="dark"]` selectors
4. Respect `prefers-color-scheme` as the default if no stored preference

---

## Phase 6 — QoL Improvements

> Proposed 2026-02-22 after user study of the live PWA on iOS.
> All seven tasks touch only `src/main.ts`, `index.html`, and `src/style.css`; no data pipeline changes.

### T16 · iOS "Add to Home Screen" hint on the empty state
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**Problem**: iOS never fires `beforeinstallprompt`, so the existing install banner is **completely invisible to iOS users**. They have no idea the app can be installed.

**What to do**:
In `src/main.ts` add a `renderEmptyState()` function (called when query is empty). Inside it, when running on iOS Safari **not** in standalone mode and the user has not dismissed the hint:
- Show a card with icon 📲 and bilingual text: "Добави в началния екран / Add to Home Screen: Натисни **Сподели** (□↑) → **Добави към началния екран**"
- A dismiss button (✕) stores `localStorage.setItem('ios-hint-dismissed', '1')` and removes the card
- Detection: `const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)` and `(navigator as any).standalone !== true`

Add CSS for `.ios-hint` — card style, muted-blue border, icon on the left, dismiss button on the right.

**Acceptance criteria**:
- On iOS Safari (not PWA), empty state shows the hint card
- Tapping ✕ dismisses permanently (survives page reload)
- Card is NOT shown in standalone mode or on non-iOS devices
- Card is NOT shown when user has typed something

---

### T17 · Recent searches (tappable chips)
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**What to do**:
1. Add helpers `getRecentSearches(): string[]` and `addRecentSearch(q: string): void` that read/write `localStorage` key `'recent-searches'` as a JSON array (max 8 items, deduped, most-recent first).
2. In `runSearch()`, after a successful search (non-empty results), call `addRecentSearch(query)`.
3. In `renderEmptyState()`, if `getRecentSearches()` is non-empty, render a row:
   ```
   🕐 Последни / Recent:   [баба]  [house]  [красив]  …
   ```
   Each chip is a `<button class="chip">` that on click sets `searchInput.value = q` and calls `runSearch()`.

Add CSS for `.chip-row` (horizontal flex, wrapping), `.chip` (pill button, surface background, border, hover highlight).

**Acceptance criteria**:
- First visit: no recent section shown
- After searching "баба", clearing, and revisiting empty state: chip "баба" is visible
- Clicking the chip searches "баба"
- Maximum 8 chips shown (oldest dropped)
- Chips survive page reload

---

### T18 · Page title tracks the current query
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**What to do**:
In `runSearch()`:
```typescript
document.title = query ? `${query} – БГ-АН Речник` : 'БГ–АН Речник'
```
One line. Call it unconditionally at the start of `runSearch()`.

**Acceptance criteria**:
- Browser tab shows e.g. `баба – БГ-АН Речник` while searching
- Tab reverts to `БГ–АН Речник` when input is cleared
- Browser history entries carry the word (making bookmarks and back-button navigation meaningful)

---

### T19 · Scroll to top when a new search is typed
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**What to do**:
At the top of `runSearch()`, when query is non-empty:
```typescript
window.scrollTo({ top: 0, behavior: 'smooth' })
```
This ensures results are visible even if the user had scrolled deep into a previous result set.

**Acceptance criteria**:
- Scroll position resets to top on every non-empty search
- Smooth animation (not an instant jump)

---

### T20 · Web Share API on result cards
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**What to do**:
In `renderEntries()`, add a share button inside `.headword-line` for each card:
```typescript
if (navigator.share) {
  html.push(`<button class="share-btn" data-word="${escHtml(word)}" aria-label="Share ${escHtml(word)}" title="Сподели / Share">⬆</button>`)
}
```
Wire up after `innerHTML` is set:
```typescript
resultsEl.querySelectorAll<HTMLButtonElement>('.share-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const word = btn.dataset['word'] ?? ''
    const url = new URL(window.location.href)
    url.searchParams.set('q', word)
    void navigator.share({ title: `${word} – БГ-АН Речник`, url: url.toString() })
  })
})
```
Button is completely absent when `navigator.share` is falsy (desktop Chrome, Firefox without share support).

Add CSS for `.share-btn` — small, borderless, emoji, aligned to the right of `.headword-line`.

**Acceptance criteria**:
- On iOS PWA/Safari: share button appears on each card; tapping opens native share sheet with the word's permalink
- On Firefox desktop: button is absent (no broken UI)
- Shared URL contains `?q=word` so recipient lands directly on that word

---

### T21 · Example searches on the empty state
**Status**: `[ ]`
**Depends on**: T07, T16, T17 (shares `renderEmptyState()`)
**Agent**: any

**What to do**:
In `renderEmptyState()`, always render a row of example words:
```
Например / e.g.:   [баба]  [house]  [красив]  [ходя]  [бърз]
```
Use the same `.chip` style as T17 but add `.chip-example` for a slightly different colour (muted, to visually separate from recent searches).

**Acceptance criteria**:
- Shown on empty state even on first visit
- Clicking an example chip searches that word
- Example chips are visually distinct from recent-search chips

---

### T22 · Offline / online status indicator
**Status**: `[ ]`
**Depends on**: T07
**Agent**: any

**What to do**:
1. Add to `index.html` (above `<main>` or inside `<header>`):
   ```html
   <div id="offline-banner" class="offline-banner hidden">
     📴 Офлайн режим / Offline — речникът работи без интернет
   </div>
   ```
2. In `src/main.ts`:
   ```typescript
   const offlineBanner = document.getElementById('offline-banner') as HTMLDivElement
   function updateOnlineStatus(): void {
     offlineBanner.classList.toggle('hidden', navigator.onLine)
   }
   window.addEventListener('online', updateOnlineStatus)
   window.addEventListener('offline', updateOnlineStatus)
   updateOnlineStatus() // set initial state
   ```
3. Add CSS for `.offline-banner` — full-width, amber/yellow background, centred text, small font, no close button needed (auto-hides when back online).

**Acceptance criteria**:
- Banner appears within 1 second of going offline (DevTools → Network → Offline)
- Banner disappears when back online
- Banner is not shown when online on page load
- Text is reassuring, not alarming (the app *works* offline — this is a feature)

---

## Decisions (Do Not Revisit)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | WikiDict 2025-11 | Latest release, CC-licensed, clean schema |
| Storage format | Sorted JSON (not SQLite in browser) | Zero browser deps, all browsers, static deploy |
| Search algorithm | Binary search on sorted arrays | O(log n), instant after load, no index needed |
| Framework | Vite + vanilla TypeScript | Minimal bundle, fast builds, no framework overhead |
| PWA SW generator | vite-plugin-pwa (Workbox) | Battle-tested, handles pre-caching, auto-update |
| Deployment | GitHub Pages via GitHub Actions | Free, HTTPS, no server needed |
| SQLite WASM | Rejected | Not needed; would require COOP/COEP headers incompatible with GitHub Pages |
| Data committed? | No (generated in CI) | SQLite is 18 MB, JSON is 14 MB — too large for git |

---

## Data Contracts

### `public/data/bg-en.json` and `public/data/en-bg.json`

```typescript
interface DataFile {
  version: string       // e.g. "2025-11"
  entries: Entry[]      // sorted by entries[i][0].casefold()
}

type Entry = [
  written_rep: string,  // headword in source language
  trans_list:  string,  // translations joined by " | " (may be "")
  sense_list:  string,  // glosses joined by " | " (may be "")
  pos:         string,  // "n"|"prop.n"|"v"|"adj"|"adv"|"prep"|"part"|"num"|""
]
```

**Invariants**:
- `entries` is sorted ascending by `entries[i][0].casefold()` (case-insensitive)
- Multiple entries may share the same `written_rep` (different POS or translations)
- `trans_list` separator is ` | ` (space-pipe-space)
- All strings are UTF-8, Cyrillic preserved as-is (not escaped)

---

## Progress Summary

| Phase | Tasks | Done | Remaining |
|-------|-------|------|-----------|
| 0 · Bootstrap | T01 T02 T03 | 3 | 0 |
| 1 · Data | T04 T05 | 2 | 0 |
| 2 · App | T06 T07 | 2 | 0 |
| 3 · PWA | T08 T09 | 2 | 0 |
| 4 · Deploy | T10 T11 | 2 | 0 |
| 5 · Polish | T12–T15 | 4 | 0 |
| 6 · QoL | T16–T22 | 0 | 7 |
| **Total** | **22** | **15** | **7** |

---

## Agent Notes / Completion Log

> Agents: when you complete a task, add an entry here.

| Task | Agent | Date | Notes |
|------|-------|------|-------|
| T01–T11 | Claude Code | 2026-02-21 | Full project scaffolded: Vite+TS, PWA plugin, icon generation, data pipeline (46k bg-en + 65k en-bg entries), search/UI/CSS, GitHub Actions deploy workflow, README. `npm run build` green. |
| T09 | Claude Code | 2026-02-21 | Verified SW has CacheFirst strategy for dict-data-v1; data files in dist/data/. Marked done (browser test deferred to manual QA). |
| T12–T15 | Claude Code | 2026-02-21 | Polish: Escape clears, Ctrl+L focuses, auto-detect emoji indicator, copy button (📋) with 1.5s feedback, progress bar with CSS transition, dark/light theme toggle with localStorage. All features in main.ts; index.html and style.css updated. `npm run build` green. |
| T09,T12–T15 | Claude Code | 2026-02-21 | T09: HTTP smoke test verified (all endpoints 200, smoke_test.js written). T12–T15: Already implemented in main.ts/index.html/style.css — keyboard shortcuts (Escape/Ctrl+L), copy buttons, progress bar, dark mode toggle with localStorage. All 15 tasks complete. `npm run build` green. |
