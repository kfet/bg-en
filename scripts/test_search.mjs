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

function fold(s) { return s.toLowerCase() }

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

// ── EN→BG search ─────────────────────────────────────────────────────────────
console.log('\nEN→BG prefix search:')
const house = searchPrefix(enBg.entries, 'house')
assert(house.length >= 1, `'house' returns ≥1 result (got ${house.length})`)
assert(house.some(e => fold(e[0]) === 'house'), "exact entry for 'house' present")
const houseEntry = house.find(e => fold(e[0]) === 'house')
assert(houseEntry !== undefined && houseEntry[1].length > 0, "'house' has a non-empty translation")

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

const validPos = new Set(['n', 'prop.n', 'v', 'adj', 'adv', 'prep', 'part', 'num', 'interj', 'pron', 'conj', 'det', ''])
const badPos = bgEn.entries.map(e => e[3]).filter(p => !validPos.has(p))
assert(badPos.length === 0, `all POS values are valid (unexpected: ${JSON.stringify(badPos.slice(0,5))})`)

// Check sorted order of full dataset (sample every 1000th entry)
let globalSorted = true
for (let i = 1000; i < bgEn.entries.length; i += 1000) {
  if (fold(bgEn.entries[i][0]) < fold(bgEn.entries[i-1][0])) { globalSorted = false; break }
}
assert(globalSorted, "bg-en dataset is globally sorted (sampled)")

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
console.log(`${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail) { process.exitCode = 1; console.error('\nSome tests FAILED.') }
else console.log('\nAll tests passed. ✓')
