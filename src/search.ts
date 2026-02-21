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
    // Load both datasets in parallel — roughly halves first-load time
    let loaded = 0
    const tick = () => {
      loaded++
      onProgress?.(loaded === 1 ? 55 : 100)
    }
    const [bg, en] = await Promise.all([
      fetchDataset('bg-en').then(d => { tick(); return d }),
      fetchDataset('en-bg').then(d => { tick(); return d }),
    ])
    bgEnData = bg
    enBgData = en
  })()

  return loadPromise
}

export function isLoaded(): boolean {
  return bgEnData !== null && enBgData !== null
}

// ── Case folding ──────────────────────────────────────────────────────────────

/** Case-insensitive fold. Uses toLowerCase() — good for both Cyrillic and Latin. */
function fold(s: string): string {
  return s.toLowerCase()
}

// ── Binary search ─────────────────────────────────────────────────────────────

/**
 * Find the index of the first entry whose fold(written_rep) >= fold(prefix)
 */
function lowerBound(entries: Entry[], prefix: string): number {
  const p = fold(prefix)
  let lo = 0
  let hi = entries.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (fold(entries[mid][0]) < p) lo = mid + 1
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

  const p = fold(prefix.trim())
  const start = lowerBound(entries, p)
  const results: Entry[] = []

  for (let i = start; i < entries.length && results.length < maxResults; i++) {
    const key = fold(entries[i][0])
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

  const target = fold(word)
  const start = lowerBound(entries, target)
  const results: Entry[] = []

  for (let i = start; i < entries.length; i++) {
    const key = fold(entries[i][0])
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
