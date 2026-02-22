# Changelog

## [Unreleased]

### Added (Phase 6 — T16–T22)
- **T16** iOS "Add to Home Screen" hint on empty state — shown only on iOS Safari outside standalone mode
- **T17** Recent searches — tappable chips (up to 8) on the empty state, persisted via `localStorage`
- **T18** Page title tracks current query — `<title>` updates to `word — БГ–АН Речник` while searching
- **T19** Scroll-to-top on every new search — `window.scrollTo({ top: 0 })` in `runSearch()`
- **T20** Web Share API button on result cards — 🔗 button appears when `navigator.share` is available; shares `?q=word` URL
- **T21** Example searches on empty state — tappable BG + EN example chips for instant demo
- **T22** Offline/online status banner — shows a dark banner when `navigator.onLine` is false; auto-hides on reconnect

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
