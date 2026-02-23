# Changelog

## [Unreleased]

### Added
- **EN details in BG→EN results** (`src/main.ts`, `src/style.css`): when searching Bulgarian→English, each English translation now shows its IPA pronunciation and any irregular forms (plural, past/pp for verbs, comparative/superlative for adjectives) — mirroring the BG detail block that already appeared in EN→BG results. For example, searching "дете" shows "child /ˈtʃaɪɫd/ pl: children"; "вървя" shows translations with their past tense/pp where available.

### Added
- **EN→BG details**: when searching English→Bulgarian, each translation chip now shows its Bulgarian pronunciation (IPA), grammatical gender, aspect (for verbs), and plural form — sourced from the kaikki bg-en metadata
- **Test coverage** `scripts/test_search.mjs` — added sort-order assertion for en-bg dataset and rank-prefix regression tests for both datasets (48 tests total)
- **T16** iOS "Add to Home Screen" hint on empty state — shown only on iOS Safari outside standalone mode; dismissible (persisted via `localStorage`)
- **T17** Recent searches — tappable chips (up to 8) on the empty state, persisted via `localStorage`
- **T18** Page title tracks current query — `<title>` updates to `word — БГ–АН Речник` while searching
- **T19** Scroll-to-top on every new search — `window.scrollTo({ top: 0 })` in `runSearch()`
- **T20** Web Share API button on result cards — 🔗 button appears when `navigator.share` is available; shares `?q=word` URL
- **T21** Example searches on empty state — tappable BG + EN example chips for instant demo
- **T22** Offline/online status banner — amber banner when `navigator.onLine` is false; auto-hides on reconnect
- **iOS keyboard** — `autofocus` attribute + `pageshow` listener in iOS standalone mode raises keyboard on every app open (both fresh launch and resume from background)
- **Documentation** — T16–T22 fully specified in `plan.md` Phase 6; `AGENTS.md` updated

### Fixed
- **BG→EN accent-insensitive search** (`src/search.ts`, `scripts/build_data.py`): 35% of BG headwords (16,188 entries) carry a combining acute accent (U+0301) as a stress mark (e.g. "ко́тка"). Searching without the accent — as users always do — caused the binary search to miss them entirely. Fixed `fold()` in `search.ts` to strip U+0301 before comparison, and updated the sort key in `build_data.py` to use the same normalization. "котка" now correctly finds "cat", "гра́д" finds "city"/"hail", etc. 6 new regression tests added.
- **EN→BG asymmetry for "кола" / "cab"**: WikiDict's reverse-mapping stored rank-prefixed headwords (`1:2cab`, `2:3car`) in the EN→BG SQLite, making them unreachable by binary search. `build_data.py` now strips `N:M` rank prefixes from `written_rep` (headwords) in addition to translation tokens, so "cab" → "кола" and "car" → "кола" are now correctly found.
- **Correctness** `src/main.ts` — EN→BG sense line now shown when no BG word-details are available (was unconditionally hidden whenever `dir === 'en-bg'`, leaving users with zero context for words without BG metadata)
- **Data pipeline** `scripts/build_data.py` — strip WikiDict rank-prefixes (e.g. `1:2cab | 2:3car` → `cab | car`) from `trans_list`; regression test added
- **Security** `src/main.ts` — `posTag()` and gender-badge fallbacks now wrapped with `escHtml()` for defence-in-depth
- **Correctness** `index.html` — added `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags for reliable `navigator.standalone` on iOS 14 and below
- **Simplification** `src/style.css` — added `position: relative` to `.offline-banner` so `z-index: 9` takes effect

## [0.1.0] - 2026-02-21

First draft release of the Bulgarian-English dictionary PWA.

### Added
- Offline-first PWA (Vite + vite-plugin-pwa, service worker, installable)
- Auto-detect direction (Cyrillic → BG→EN, Latin → EN→BG); read-only badge inside search field
- URL search params (`?q=WORD`) for shareable links; state restored on load
- Result count badge showing direction ("3 думи · БГ→АН")
- Prefix highlighting with `<mark>` (bold + underline) on matched headword prefix
- Richer word cards: numbered senses (from " | " split), domain badges, meaning count, Wiktionary link
- Clickable translation chips → reverse lookup with scroll-to-top
- Bulgarian metadata from kaikki.org (~120 MB JSONL, cached): IPA, grammatical gender (м./ж./ср.р.), plural form, verb aspect (несв./св.) + paired form — 12,688 BG headwords enriched
- English IPA from ipa-dict (US + UK, ~5 MB total) — 27,677 EN headwords (61%) have IPA
- English irregular morphology from Unimorph (~18 MB) + 130-entry curated patch: irregular plurals (child→children, mouse→mice), verb forms (go→went/gone, be→was/were/been), comparatives (good→better/best) — ~3,200 EN entries enriched
- Parallel data loading with `Promise.all`; 0%→55%→100% progress bar
- Clipboard copy with `execCommand` fallback
- SEO: Open Graph meta tags, `robots.txt`, `sitemap.xml`
- `<noscript>` notice; `<meta name="theme-color">`; Apple touch icon
- CI via GitHub Actions → GitHub Pages deploy
- CI SQLite + kaikki + ipa-dict + Unimorph cache (`actions/cache@v4`)
- Test suite: 39 tests (`npm test` via `node scripts/test_search.mjs`)
- `npm run data` to rebuild JSON from sources; `npm start` for local preview
