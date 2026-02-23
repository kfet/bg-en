#!/usr/bin/env node
/**
 * scripts/test_search.mjs
 * Node.js unit test for the binary search logic (no browser, no Playwright).
 * Run with: node scripts/test_search.mjs
 * Requires: public/data/bg-en.json and public/data/en-bg.json (from build_data.py)
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const bgEn = JSON.parse(readFileSync(join(root, 'public/data/bg-en.json'), 'utf8'))
const enBg = JSON.parse(readFileSync(join(root, 'public/data/en-bg.json'), 'utf8'))

// ── Replicate search.ts logic exactly ────────────────────────────────────────

function fold(s) { return s.replace(/\u0301/g, '').toLowerCase() }

function lowerBound(entries, prefix) {
  const p = fold(prefix)
  let lo = 0, hi = entries.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (fold(entries[mid][0]) < p) lo = mid + 1
    else hi = mid
  }
  return lo
}

function searchPrefix(entries, rawPrefix, maxResults = 30) {
  if (!entries || !rawPrefix.trim()) return []          // ← same guard as search.ts
  const p = fold(rawPrefix.trim())
  const start = lowerBound(entries, p)
  const results = []
  for (let i = start; i < entries.length && results.length < maxResults; i++) {
    const key = fold(entries[i][0])
    if (!key.startsWith(p)) break
    results.push(entries[i])
  }
  return results
}

function lookupExact(entries, word) {
  if (!entries) return []
  const target = fold(word)
  const start = lowerBound(entries, target)
  const results = []
  for (let i = start; i < entries.length; i++) {
    const key = fold(entries[i][0])
    if (key !== target) break
    results.push(entries[i])
  }
  return results
}

function detectDirection(input) {
  return /[\u0400-\u04FF]/.test(input) ? 'bg-en' : 'en-bg'
}

// ── Test harness ─────────────────────────────────────────────────────────────

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); pass++ }
  else { console.error(`  ✗ ${label}`); fail++ }
}

console.log('=== search.ts logic tests ===\n')

// ── Direction detection ───────────────────────────────────────────────────────
console.log('Direction detection:')
assert(detectDirection('баба') === 'bg-en',  "Cyrillic → 'bg-en'")
assert(detectDirection('house') === 'en-bg', "Latin → 'en-bg'")
assert(detectDirection('') === 'en-bg',      "empty → 'en-bg' (default)")
assert(detectDirection('house123') === 'en-bg', "mixed Latin+digits → 'en-bg'")
assert(detectDirection('hou баба') === 'bg-en', "mixed with Cyrillic → 'bg-en'")

// ── BG→EN search ─────────────────────────────────────────────────────────────
console.log('\nBG→EN prefix search:')
const баба = searchPrefix(bgEn.entries, 'баба')
assert(баба.length >= 1,                          `'баба' returns ≥1 result (got ${баба.length})`)
assert(баба.some(e => e[0] === 'баба'),            "exact entry for 'баба' present")
assert(баба.every(e => fold(e[0]).startsWith('баба')), "all results start with 'баба'")

const ход = searchPrefix(bgEn.entries, 'ход', 20)
assert(ход.length >= 1, `'ход' returns ≥1 result (got ${ход.length})`)
let sorted = true
for (let i = 1; i < ход.length; i++) {
  if (fold(ход[i][0]) < fold(ход[i-1][0])) { sorted = false; break }
}
assert(sorted, "results for 'ход' are in sorted order")

// Accent-insensitive search: BG headwords carry combining acute (U+0301) as
// stress marks. Typing without accents must still find accented headwords.
console.log('\nBG→EN accent-insensitive search:')
const котка = searchPrefix(bgEn.entries, 'котка')       // user types without accent
assert(котка.length >= 1,                              `'котка' (no accent) returns ≥1 result (got ${котка.length})`)
assert(котка.some(e => fold(e[0]) === 'котка'),        "'котка' result has fold(rep)='котка'")
assert(котка.some(e => e[1].includes('cat')),          "'котка' finds entry whose translation includes 'cat'")
const котка2 = lookupExact(bgEn.entries, 'котка')
assert(котка2.length >= 1,                             `lookupExact 'котка' returns ≥1 result (got ${котка2.length})`)
assert(котка2.some(e => e[1].includes('cat')),         "lookupExact 'котка' finds 'cat'")
// Entry stored with accent should also be findable with the accent
const котка3 = lookupExact(bgEn.entries, 'ко\u0301тка')
assert(котка3.length >= 1,                             `lookupExact 'ко́тка' (with accent) also works (got ${котка3.length})`)

// ── EN→BG search ─────────────────────────────────────────────────────────────
console.log('\nEN→BG prefix search:')
const house = searchPrefix(enBg.entries, 'house')
assert(house.length >= 1, `'house' returns ≥1 result (got ${house.length})`)
assert(house.some(e => fold(e[0]) === 'house'), "exact entry for 'house' present")
const houseEntry = house.find(e => fold(e[0]) === 'house')
assert(houseEntry !== undefined && houseEntry[1].length > 0, "'house' has a non-empty translation")

// ── lookupExact ───────────────────────────────────────────────────────────────
console.log('\nlookupExact:')
const houseExact = lookupExact(enBg.entries, 'house')
assert(houseExact.length >= 1, `lookupExact 'house' returns ≥1 result (got ${houseExact.length})`)
assert(houseExact.every(e => fold(e[0]) === 'house'), "all lookupExact 'house' entries have fold(rep) === 'house'")
// 'house' appears in multiple POS (noun, verb) — verify that at least two are returned
assert(houseExact.length >= 2, `lookupExact 'house' returns ≥2 entries (multiple POS) (got ${houseExact.length})`)
// word not in the dict returns []
const missing = lookupExact(enBg.entries, 'zzznonsense999')
assert(missing.length === 0, "lookupExact 'zzznonsense999' returns []")
// BG exact lookup
const бабаExact = lookupExact(bgEn.entries, 'баба')
assert(бабаExact.length >= 1, `lookupExact 'баба' returns ≥1 result (got ${бабаExact.length})`)
assert(бабаExact.every(e => fold(e[0]) === 'баба'), "all lookupExact 'баба' entries have fold(rep) === 'баба'")

// ── Case insensitivity ────────────────────────────────────────────────────────
console.log('\nCase insensitivity:')
assert(searchPrefix(bgEn.entries, 'БАБА').length >= 1, "'БАБА' (caps) → results")
assert(searchPrefix(enBg.entries, 'HOUSE').length >= 1, "'HOUSE' (caps) → results")

// ── Edge cases ────────────────────────────────────────────────────────────────
console.log('\nEdge cases:')
assert(searchPrefix(bgEn.entries, '').length === 0,          "empty prefix → []")
assert(searchPrefix(bgEn.entries, '   ').length === 0,       "whitespace-only prefix → []")
assert(searchPrefix(bgEn.entries, 'zzzzzzzzz').length === 0, "unknown word → []")
assert(searchPrefix(bgEn.entries, 'баба', 2).length <= 2,    "maxResults=2 respected")

// ── Data integrity ────────────────────────────────────────────────────────────
console.log('\nData integrity:')
const version = bgEn.version
assert(typeof version === 'string' && version.length > 0, `version field present: "${version}"`)
assert(bgEn.entries.length >= 40000,  `bg-en has ≥40k entries (got ${bgEn.entries.length})`)
assert(enBg.entries.length >= 40000,  `en-bg has ≥40k entries (got ${enBg.entries.length})`)
assert(bgEn.entries.every(e => Array.isArray(e) && e.length === 4), "all bg-en entries are [4]")
assert(enBg.entries.every(e => Array.isArray(e) && e.length === 4), "all en-bg entries are [4]")

// Meta (kaikki) checks — bg-en only
const meta = bgEn.meta ?? {}
assert(typeof meta === 'object', "bg-en has meta object")
const metaCount = Object.keys(meta).length
assert(metaCount > 5000, `meta has ${metaCount.toLocaleString()} entries (>5000)`)
// Spot-check баба
const баба_meta = meta['баба']
assert(баба_meta?.ipa && баба_meta.ipa.includes('['), `баба meta has IPA: ${JSON.stringify(баба_meta?.ipa)}`)
assert(баба_meta?.gender === 'f', `баба meta has gender=f (got ${баба_meta?.gender})`)
assert(баба_meta?.pl === 'баби', `баба meta has pl=баби (got ${баба_meta?.pl})`)
// en-bg has IPA-only meta from ipa-dict
const enMeta = enBg.meta ?? {}
assert(typeof enMeta === 'object', "en-bg has meta object")
const enMetaCount = Object.keys(enMeta).length
assert(enMetaCount > 10000, `en-bg meta has ${enMetaCount.toLocaleString()} IPA entries (>10k)`)
const house_meta = enMeta['house']
assert(house_meta?.ipa?.startsWith('/'), `house meta has IPA: ${JSON.stringify(house_meta?.ipa)}`)
// Irregular forms
const go_meta = enMeta['go']
assert(go_meta?.past === 'went', `go meta past=went (got ${go_meta?.past})`)
assert(go_meta?.pp   === 'gone', `go meta pp=gone   (got ${go_meta?.pp})`)
const child_meta = enMeta['child']
assert(child_meta?.pl === 'children', `child meta pl=children (got ${child_meta?.pl})`)
const good_meta = enMeta['good']
assert(good_meta?.cmp === 'better', `good meta cmp=better (got ${good_meta?.cmp})`)
assert(good_meta?.sup === 'best',   `good meta sup=best   (got ${good_meta?.sup})`)

const validPos = new Set(['n', 'prop.n', 'v', 'adj', 'adv', 'prep', 'part', 'num', 'interj', 'pron', 'conj', 'det', ''])
const badPos = bgEn.entries.map(e => e[3]).filter(p => !validPos.has(p))
assert(badPos.length === 0, `all POS values are valid (unexpected: ${JSON.stringify(badPos.slice(0,5))})`)
const badPosEN = enBg.entries.map(e => e[3]).filter(p => !validPos.has(p))
assert(badPosEN.length === 0, `all en-bg POS values are valid (unexpected: ${JSON.stringify(badPosEN.slice(0,5))})`)

// Check sorted order of full dataset (sample ~5% of consecutive pairs, step 20)
let globalSorted = true
for (let i = 1; i < bgEn.entries.length; i += 20) {
  if (fold(bgEn.entries[i][0]) < fold(bgEn.entries[i-1][0])) { globalSorted = false; break }
}
assert(globalSorted, "bg-en dataset is globally sorted (sampled ~5% consecutive pairs)")

// Check sorted order of en-bg dataset (sample ~5% of consecutive pairs, step 20)
let enGlobalSorted = true
for (let i = 1; i < enBg.entries.length; i += 20) {
  if (fold(enBg.entries[i][0]) < fold(enBg.entries[i-1][0])) { enGlobalSorted = false; break }
}
assert(enGlobalSorted, "en-bg dataset is globally sorted (sampled ~5% consecutive pairs)")

// Regression: no entry should have WikiDict rank prefixes (e.g. "1:2cab | 2:3car")
// Build data pipeline must strip these via clean_trans() in build_data.py
const rankPrefixRe = /^\d+:\d/
const rankPrefixed = bgEn.entries.filter(e => e[1].split(' | ').some(t => rankPrefixRe.test(t)))
assert(rankPrefixed.length === 0,
  `no rank-prefixed translations (found: ${JSON.stringify(rankPrefixed.slice(0,3).map(e => [e[0], e[1]]))})`)

const rankPrefixedEN = enBg.entries.filter(e => e[1].split(' | ').some(t => rankPrefixRe.test(t)))
assert(rankPrefixedEN.length === 0,
  `no rank-prefixed translations in en-bg (found: ${JSON.stringify(rankPrefixedEN.slice(0,3).map(e => [e[0], e[1]]))})`)


// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
console.log(`${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail) { process.exitCode = 1; console.error('\nSome tests FAILED.') }
else console.log('\nAll tests passed. ✓')
