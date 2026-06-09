# Changelog

## [Unreleased]

### Changed
- **App icons redrawn and made properly maskable** (`scripts/make_icons.sh`, `public/icons/`, `vite.config.ts`, `index.html`). The previous PNGs baked in their own rounded corners and transparent corner pixels, then declared `purpose: "any maskable"` on a non-maskable image — so iOS/Android applied a second mask over the top and Android adaptive masks risked clipping the glyphs. Icons are now drawn full-bleed from a single SVG master (`public/icons/icon.svg`) and split by purpose: `icon-192.png` + `icon-512.png` are `purpose: "any"`, and a new `icon-512-maskable.png` keeps the БГ↔АН glyphs inside the central ~78% safe zone for `purpose: "maskable"`. The `↔` arrow weight/colour now matches the letters instead of reading as a faint afterthought, and the gradient is reconciled to the `#1565c0` theme colour. A dedicated opaque `apple-touch-icon.png` (180×180, the Apple-recommended size, flattened so iOS never shows black behind transparency) replaces the reused 192px manifest icon. `scripts/make_icons.sh` regenerates the whole set via rsvg-convert + ImageMagick.

## [0.4.0] - 2026-05-20

### Changed
- **EN→BG: domain labels are now translated to Bulgarian** (`src/main.ts`). The leading parenthetical that Wiktionary stamps on senses — `(transitive)`, `(colloquial, Commonwealth)`, `(racquet sports, billiards)` — was previously rendered verbatim in English inside the `.domain-badge`. A new `DOMAIN_LABEL` table (~340 entries) maps the most common labels to Bulgarian abbreviations (прех., непрех., разг., мед., мат., биляр, …). The string is comma-split, each token is translated independently, unknown tokens pass through unchanged, and Wiktionary's `_` placeholder is dropped. The table was sized from a frequency-sort of all ~38k label-token occurrences in the en-bg dataset; it covers ~88% of occurrences.
- **EN→BG: English gloss never shown inline; revealed by a per-card toggle** (`src/main.ts`, `src/style.css`). Previously the English Wiktionary gloss was rendered inline on rows where the BG translation lacked metadata (IPA/gender/aspect) — producing an inconsistency visible on `love`: senses 1–3 were BG-only but the English prose leaked through on senses 4 ('скъпа') and 6 ('нула'). The new rule is uniform: in EN→BG, the gloss is *never* shown inline. Each card with any gloss content gains a `Покажи определение / Show definition` toggle that reveals all glosses on demand; revealed glosses are demoted (smaller, italic, muted) and each item is prefixed with an `EN` language badge. BG→EN behaviour unchanged.

### Added
- **kaikki English IPA fallback** (`scripts/build_data.py`, `public/data/NOTICE`). The English IPA pipeline previously used only ipa-dict cmudict-ipa, which misses loanwords and many proper nouns (`chamois`, `beige`, `croissant`, `fjord`, `quinoa`, `sushi` had no IPA). Augmented with a stream-parsing pass over the kaikki.org English Wiktionary extract (~3 GB JSONL, streamed line-by-line, never persisted to disk; only a derived ~5 MB TSV is cached). cmudict-ipa retains priority (cleaner narrow transcription); kaikki only fills holes. After this change the en→bg dataset enrichment goes from 24,101 → 31,283 headwords with IPA. CI cache key bumped from `wikdict-kaikki-ipadict-unimorph-*` to `wikdict-kaikki-ipadict-unimorph-kaikkien-*`. NOTICE updated with the kaikki English attribution.

## [0.3.0] - 2026-02-22

### Added
- **App version display** (`src/main.ts`, `src/style.css`, `index.html`): The current version string (from `VERSION`) is now displayed in the footer next to the MIT license link.

## [0.2.0] - 2026-02-22

### Added
- **OpenSearch / browser search-engine integration** (`public/opensearch.xml`, `index.html`): added an OpenSearch Description Document so browsers (Firefox, Chromium-based, Safari) can discover and register the site as a custom search engine. Right-clicking the address bar or the search input now offers "Add as search engine". The URL template is `https://kfet.github.io/bg-en/?q={searchTerms}`. Added `<link rel="search" ...>` in `<head>` and `name="q"` on the input so browsers can auto-detect the query parameter.

### Added
- **EN details in BG→EN results** (`src/main.ts`, `src/style.css`): when searching Bulgarian→English, each English translation now shows its IPA pronunciation and any irregular forms (plural, past/pp for verbs, comparative/superlative for adjectives) — mirroring the BG detail block that already appeared in EN→BG results. For example, searching "дете" shows "child /ˈtʃaɪɫd/ pl: children"; "вървя" shows translations with their past tense/pp where available.
- **EN→BG details**: when searching English→Bulgarian, each translation chip now shows its Bulgarian pronunciation (IPA), grammatical gender, aspect (for verbs), and plural form — sourced from the kaikki bg-en metadata
- **Test coverage** `scripts/test_search.mjs` — added sort-order assertion for en-bg dataset and rank-prefix regression tests for both datasets (54 tests total)
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
- **`loadDictionary` race condition** (`src/search.ts`): `onProgress(100)` now fires *after* `bgEnData`/`enBgData` are assigned, so URL-parameter boot searches (`?q=word`) always find the data ready instead of silently returning no results.
- **`loadPromise` retry on failure** (`src/search.ts`): failed `loadDictionary` calls now reset `loadPromise = null` in the `.catch` handler, allowing retry on the next call instead of permanently returning the rejected promise.
- **`highlightPrefix` accent-aware split** (`src/main.ts`): replaced `word.toLowerCase()` with the accent-stripping `fold()` from `search.ts` and walks the original string char-by-char (skipping U+0301) to compute the correct highlight split point. Previously, searching `"котка"` found the headword `"ко́тка"` via binary search but rendered it with no `<mark>` highlight.
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
