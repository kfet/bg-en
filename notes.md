# BG ↔ EN Dictionary PWA – Research Notes

---

## 1. Data Source: WikiDict

**Project**: https://www.wikdict.com — Wiktionary-derived bilingual dictionaries  
**License**: Creative Commons (derived from Wiktionary data)  
**Download index**: https://download.wikdict.com/dictionaries/sqlite/  
**Latest release**: `2_2025-11` (November 2025)  
**Previous release used below**: `2_2024-10` (October 2024)

### Files needed (latest: 2025-11)

| File | URL | Size |
|------|-----|------|
| `bg-en.sqlite3` | `https://download.wikdict.com/dictionaries/sqlite/2_2025-11/bg-en.sqlite3` | 4.6 MB |
| `en-bg.sqlite3` | `https://download.wikdict.com/dictionaries/sqlite/2_2025-11/en-bg.sqlite3` | 13.7 MB |
| `bg.sqlite3` (monolingual, optional) | `…/bg.sqlite3` | 31.8 MB |
| `en.sqlite3` (monolingual, skip) | `…/en.sqlite3` | 515 MB |

We only need `bg-en` + `en-bg` for a bidirectional app. The monolingual files add morphology/forms but are much larger.

---

## 2. SQLite Schema

Both `bg-en.sqlite3` and `en-bg.sqlite3` have identical schemas:

```sql
-- Core data table (richer, with senses)
CREATE TABLE translation (
  lexentry  TEXT,    -- e.g. "bul/баба__Съществително_нарицателно_име__1"
  sense_num TEXT,    -- "01", "02", etc.
  sense     TEXT,    -- English gloss / usage note
  written_rep TEXT,  -- the headword (source language word)
  trans_list TEXT,   -- " | "-separated target-language translations
  score     REAL,    -- quality score (higher = better)
  is_good   INTEGER,
  importance REAL
);

-- Simplified lookup table (best for prefix search)
CREATE TABLE simple_translation (
  written_rep  TEXT,  -- headword
  trans_list   TEXT,  -- " | "-separated translations
  max_score    REAL,
  rel_importance REAL
);

-- Grouped view (one row per headword+trans_list combo, senses concatenated)
CREATE VIEW translation_grouped AS
  SELECT lexentry, written_rep, min(sense_num) AS min_sense_num,
         group_concat(sense, ' | ') AS sense_list,
         trans_list, max(score) AS score, max(importance) AS importance
  FROM translation
  GROUP BY lexentry, written_rep, trans_list;
```

**No indexes exist** in the downloaded files — must be created at build time.

### Entry counts (2024-10 release)

| Table | bg-en | en-bg |
|-------|-------|-------|
| `translation` | 42,207 rows | 65,542 rows |
| `simple_translation` | 41,676 rows | 41,744 rows |

### Part-of-speech encoding (BG side, from `lexentry` field)

POS is encoded in the `lexentry` as the second `__`-delimited segment:

| Bulgarian | Meaning | EN abbreviation |
|-----------|---------|-----------------|
| Съществително_нарицателно_име | common noun | n |
| Съществително_собствено_име | proper noun | prop.n |
| Глагол | verb | v |
| Прилагателно_име | adjective | adj |
| Наречие | adverb | adv |
| Предлог | preposition | prep |
| Частица | particle | part |
| Числително_име | numeral | num |

Extract with: `split(lexentry, '__')[1]`

### Sample data

**bg-en** – Bulgarian headword → English:
```
баба   → babushka
бабаит → husky | sl. bucko
ходя   → go (v)
красив → fair (adj)
бързо  → fast (adv)
България → Bulgaria
```

**en-bg** – English headword → Bulgarian:
```
house → дом | къ́ща | помещавам | стопа́нство | подслонявам се | ка́мара
house music → хаус
household → семеен | домашен | домаки́нство | семе́йство
```

The `trans_list` field uses ` | ` as the separator for multiple translations.

---

## 3. Exported Data Sizes

Exporting `translation_grouped` to JSON (uncompressed / gzipped):

| Dataset | Uncompressed | Gzipped |
|---------|-------------|---------|
| bg-en (translation_grouped) | 3.9 MB | **531 KB** |
| en-bg (translation_grouped) | 10.8 MB | **2.9 MB** |
| **Total** | **14.7 MB** | **~3.4 MB** |

→ **~3.4 MB total network transfer** for the entire dictionary (both directions). Very manageable.

---

## 4. Architecture Decision

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A. JSON + binary search** (recommended) | Zero deps, works everywhere, simple SW caching, deployable as static site | Slightly larger memory footprint (~15MB RAM) |
| B. SQLite WASM (`@sqlite.org/sqlite-wasm`) | Full SQL queries, keep original format | +1.5MB WASM download, needs COOP/COEP headers, more complex | 
| C. sql.js + OPFS | Persistent SQLite in browser | Browser support gaps, complex SW setup |
| D. IndexedDB (Dexie.js) | Native browser DB, persistent | Large initial import time, more code |

### Recommended: Option A — Build-time JSON + Service Worker

**Why**: The dictionary is small (~83k entries), lookups are simple prefix-match queries, and we get maximum portability (works in all browsers, deployable to GitHub Pages for free). No SQLite runtime in the browser at all.

### Data pipeline

```
WikiDict .sqlite3 files
        │
        ▼  (build-time Python script)
Sorted JSON arrays
  bg-en.json  ← sorted by Bulgarian written_rep
  en-bg.json  ← sorted by English written_rep
        │
        ▼  (served as static assets)
PWA Service Worker caches both files on first install
        │
        ▼  (in-browser)
Binary search for O(log n) prefix lookup
```

### JSON record format (compact)

```json
[
  ["баба", "babushka", "", ""],
  ["бабаит", "husky | sl. bucko", "", "n"],
  ["ходя", "go | walk", "to move on foot", "v"]
]
```
Fields: `[written_rep, trans_list, sense_list, pos]`  
Sort by field 0 (lowercased, locale-aware).

Or even more compact — omit empty fields, use arrays:
```json
{"entries": [["баба","babushka"],["бабаит","husky | sl. bucko","","n"], ...]}
```

---

## 5. Tech Stack

### Build (data preprocessing)
- **Python 3** + `sqlite3` stdlib — no extra deps
- Script: `scripts/build_data.py`
  - Downloads or reads local SQLite files
  - Exports `translation_grouped` → sorted JSON
  - Extracts POS from `lexentry`
  - Outputs `public/data/bg-en.json` + `public/data/en-bg.json`

### App
- **Vite** (build tool) — fast HMR, ideal for static PWA
- **TypeScript** or plain JS — no UI framework needed (dictionary UI is simple)
- **vite-plugin-pwa** — generates service worker + manifest automatically using Workbox
  - `npm install -D vite-plugin-pwa`
  - Handles pre-caching of all assets including data JSON files
  - Generates `manifest.json` from config

### Styling
- Plain CSS or **Tailwind CSS** (optional)
- Mobile-first: works on phone keyboard input (important for Bulgarian keyboard)

### Deployment
- **GitHub Pages** (free, HTTPS, custom domain support)
- Or: Netlify / Cloudflare Pages (also free)
- No server needed — fully static

---

## 6. PWA Requirements Checklist

For browser "Add to Home Screen" / installability:

- [x] Served over **HTTPS**
- [ ] `manifest.json` with:
  - `name`: "БГ-АН Речник" (or similar)
  - `short_name`: "БГ-АН"
  - `display`: `"standalone"`
  - `start_url`: `"/"`
  - `icons`: at minimum 192×192 and 512×512 PNG
  - `theme_color` + `background_color`
  - `lang`: `"bg"` or `"bg,en"`
- [ ] **Service Worker** registered that:
  - Pre-caches app shell (HTML, CSS, JS) on `install`
  - Pre-caches data files (`bg-en.json`, `en-bg.json`) on `install`
  - Responds offline with cached assets
- [ ] At least one interaction in the app (not just a link)

vite-plugin-pwa handles the manifest + SW generation. You provide config in `vite.config.ts`.

### Service Worker caching strategy

```
Cache strategy: "CacheFirst" for all assets
  - On install: pre-cache all static assets + data JSON files
  - On fetch: serve from cache, fall back to network
  - Data files are large (3.4MB total) but change rarely (per WikiDict release)
```

For data updates: use a **version string** in the JSON filename (e.g. `bg-en.v20251101.json`) so the SW re-fetches when the file is updated.

---

## 7. In-Browser Search Implementation

```typescript
// Binary search for prefix match in sorted array
function searchPrefix(entries: string[][], prefix: string, maxResults = 20): string[][] {
  const p = prefix.toLowerCase();
  let lo = 0, hi = entries.length - 1;
  
  // Find first entry >= prefix
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid][0].toLowerCase() < p) lo = mid + 1;
    else hi = mid;
  }
  
  // Collect results while they match the prefix
  const results: string[][] = [];
  let i = lo;
  while (i < entries.length && entries[i][0].toLowerCase().startsWith(p)) {
    results.push(entries[i]);
    if (++i - lo >= maxResults) break;
  }
  return results;
}
```

Startup: load both JSON files into memory (`fetch` → `JSON.parse`). With gzip, this is ~3.4MB network + ~15MB RAM. Totally fine.

For **exact lookup** (word detail view), also use binary search or a `Map<string, entry[]>` built at startup.

---

## 8. Suggested File Structure

```
bg-en/
├── scripts/
│   └── build_data.py          # fetch SQLite → generate JSON data files
├── public/
│   ├── data/
│   │   ├── bg-en.json         # built by script (not committed if large)
│   │   └── en-bg.json
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── src/
│   ├── main.ts                # app entry point
│   ├── search.ts              # binary search, data loading
│   ├── ui.ts                  # DOM manipulation
│   └── style.css
├── index.html
├── vite.config.ts             # includes VitePWA plugin config
└── package.json
```

---

## 9. Build Script Outline

```python
# scripts/build_data.py
import sqlite3, json, re, urllib.request, os

RELEASES = {
    "2025-11": {
        "bg-en": "https://download.wikdict.com/dictionaries/sqlite/2_2025-11/bg-en.sqlite3",
        "en-bg": "https://download.wikdict.com/dictionaries/sqlite/2_2025-11/en-bg.sqlite3",
    }
}

POS_MAP = {
    "Съществително_нарицателно_име": "n",
    "Съществително_собствено_ime":   "prop.n",
    "Глагол":                        "v",
    "Прилагателно_име":              "adj",
    "Наречие":                       "adv",
    "Предлог":                       "prep",
    "Частица":                       "part",
    "Числително_име":                "num",
}

def extract_pos(lexentry: str) -> str:
    parts = lexentry.split("__")
    if len(parts) >= 2:
        return POS_MAP.get(parts[1], "")
    return ""

def export_dict(db_path: str, out_path: str):
    con = sqlite3.connect(db_path)
    rows = con.execute("""
        SELECT written_rep, trans_list, sense_list, lexentry, max(score) as score
        FROM translation_grouped
        GROUP BY written_rep, trans_list
        ORDER BY written_rep COLLATE NOCASE
    """).fetchall()
    
    entries = []
    for written_rep, trans_list, sense_list, lexentry, score in rows:
        pos = extract_pos(lexentry or "")
        entries.append([written_rep, trans_list or "", sense_list or "", pos])
    
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"version": "2025-11", "entries": entries}, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"Exported {len(entries)} entries to {out_path}")

# Download if needed, then export
for name, url in RELEASES["2025-11"].items():
    db = f"/tmp/{name}.sqlite3"
    if not os.path.exists(db):
        print(f"Downloading {url}...")
        urllib.request.urlretrieve(url, db)
    export_dict(db, f"public/data/{name}.json")
```

---

## 10. vite.config.ts Outline

```typescript
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,json}'],
        // Cache data files (large) with CacheFirst
        runtimeCaching: [{
          urlPattern: /\/data\/(bg-en|en-bg)\.json$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'dict-data',
            expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        }]
      },
      manifest: {
        name: 'BG-EN Dictionary',
        short_name: 'БГ-АН',
        description: 'Offline Bulgarian-English dictionary',
        lang: 'bg',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
```

---

## 11. Key UX Considerations

1. **First load**: Show progress bar while downloading data files (~3.4MB). Cache them immediately via SW.
2. **Subsequent loads**: Instant (served from SW cache).
3. **Search direction toggle**: BG→EN / EN→BG button (or auto-detect: Cyrillic = BG mode).
4. **Keyboard**: Bulgarian Cyrillic input. On mobile, user may need to switch keyboards. Consider a transliteration mode or phonetic keyboard fallback.
5. **Results display**:
   - Headword (bold) + POS badge (n / v / adj / adv)
   - Translations separated by `|`
   - Expandable sense/gloss row for context
   - Score-sorted (higher score = more reliable translation)
6. **Install prompt**: Show "Add to Home Screen" banner after first successful search.
7. **Update notification**: When SW detects a new version, show "Update available" toast.

---

## 12. Alternative: SQLite WASM approach (for future reference)

If richer queries are needed (e.g., full-text search, morphological lookup):

- **@sqlite.org/sqlite-wasm** v3.51+ with OPFS VFS
- Download the `.sqlite3` files once → store in OPFS
- Run SQL queries in a Web Worker (required for OPFS)
- Needs `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers (not supported on GitHub Pages without a proxy)
- Adds ~1.5MB WASM overhead
- Use **wa-sqlite** (https://github.com/rhashimoto/wa-sqlite) as an alternative with better OPFS support

Not needed for this project given the data size and simple query patterns.

---

## 13. Next Steps

1. **Run `build_data.py`** to download SQLite files and generate `bg-en.json` + `en-bg.json`
2. **Scaffold Vite app**: `npm create vite@latest bg-en-dict -- --template vanilla-ts`
3. **Install vite-plugin-pwa**: `npm i -D vite-plugin-pwa`
4. **Configure vite.config.ts** (see §10 above)
5. **Implement search.ts**: binary search on loaded JSON arrays
6. **Build basic UI**: search input, direction toggle, results list
7. **Create icons**: 192×192 and 512×512 PNG (BG flag or custom icon)
8. **Deploy to GitHub Pages**: `npm run build` → push `dist/` to `gh-pages` branch
9. **Test installability**: Chrome DevTools → Application → Manifest

---

## References

- WikiDict source: https://github.com/karlb/wikdict-gen
- WikiDict web app source: https://github.com/karlb/wikdict-web
- Wiktionary BG entries: https://en.wiktionary.org/wiki/Category:Bulgarian_lemmas
- vite-plugin-pwa docs: https://vite-pwa-org.netlify.app/
- Workbox docs: https://developer.chrome.com/docs/workbox
- PWA installability criteria: https://web.dev/articles/install-criteria
- OPFS + SQLite WASM: https://sqlite.org/wasm/doc/trunk/persistence.md
- wa-sqlite: https://github.com/rhashimoto/wa-sqlite
