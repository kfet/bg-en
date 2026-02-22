# БГ ↔ АН Речник / BG–EN Dictionary

Installable offline PWA dictionary for Bulgarian ↔ English, powered by [WikiDict](https://www.wikdict.com) data (derived from Wiktionary).

**Live app**: https://YOUR-USERNAME.github.io/bg-en/   ← update after deploying

## Features

- 🔍 Instant prefix search (binary search, no server) with match highlighting
- 🔄 Bulgarian → English and English → Bulgarian
- 🤖 Auto-detects direction from Cyrillic vs Latin input
- 📶 Works fully offline after first visit
- 📲 Installable as a PWA (Add to Home Screen)
- 🌙 Dark mode (system preference + manual toggle)
- 📋 Copy translations to clipboard (HTTPS + HTTP fallback)
- 🔗 Shareable search links (`?q=WORD&dir=bg-en`)
- 🏷️ POS badges — 11% bg→en, 95% en→bg coverage
- 📊 Result count badge; "Show more" toggle for polysemous words
- ~3.4 MB one-time download (gzip), cached by service worker

## Data

| Source | Used for | Licence |
|---|---|---|
| [WikiDict](https://www.wikdict.com) 2025-11 | Translation entries (bg→en, en→bg) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [kaikki.org](https://kaikki.org/dictionary/Bulgarian/) (Wiktionary extract) | Bulgarian IPA, gender, inflections | CC BY-SA 3.0 + GFDL |
| [ipa-dict](https://github.com/open-dict-data/ipa-dict) en_US (cmudict-ipa) | English IPA pronunciations | MIT |
| [UniMorph eng](https://github.com/unimorph/eng) | English irregular plurals/verb forms | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

All CC BY-SA 3.0 data is derived from [Wiktionary](https://en.wiktionary.org).
The compiled data files (`public/data/*.json`) are distributed under CC BY-SA 3.0;
see [`public/data/NOTICE`](public/data/NOTICE) for full attribution.

- bg→en: ~46,000 entries
- en→bg: ~65,000 entries

## Development

**Requirements**: Node 20+, Python 3.10+

```bash
# 1. Install JS dependencies
npm install

# 2. Build data files (downloads ~18 MB of WikiDict SQLite, outputs ~10 MB JSON)
npm run data          # alias for: python3 scripts/build_data.py

# 3. Run search logic tests (no browser needed)
npm test

# 4. Start dev server
npm run dev

# 5. Build for production
npm run build
```

## Deployment

The app deploys automatically to GitHub Pages via GitHub Actions on every push to `main`.

To enable GitHub Pages:
1. Go to repo **Settings → Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` — the workflow will build and deploy

## Architecture

- **Data pipeline**: Python script → WikiDict SQLite → sorted JSON arrays
- **Search**: in-memory binary search (O log n), no database in browser
- **Offline**: Workbox service worker pre-caches all assets + data on first visit
- **Deploy**: GitHub Actions → GitHub Pages (static, no server needed)

## License

App code: [MIT](LICENSE)  
Dictionary data: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (WikiDict / Wiktionary / UniMorph) — see [`public/data/NOTICE`](public/data/NOTICE)
