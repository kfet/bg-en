import { loadDictionary, searchPrefix, detectDirection, getMeta, fold, type Direction, type Entry } from './search'

// ── Elements ────────────────────────────────────────────────────────────────

const searchInput    = document.getElementById('search-input')    as HTMLInputElement
const resultsEl      = document.getElementById('results')          as HTMLDivElement
const statusBar      = document.getElementById('status-bar')       as HTMLDivElement
const progressTrack  = document.getElementById('progress-track')   as HTMLDivElement
const progressFill   = document.getElementById('progress-fill')    as HTMLDivElement
const dirIndicator   = document.getElementById('dir-indicator')    as HTMLSpanElement
const themeToggle    = document.getElementById('theme-toggle')     as HTMLButtonElement
const installBanner  = document.getElementById('install-banner')   as HTMLDivElement
const installBtn     = document.getElementById('install-btn')      as HTMLButtonElement
const installDismiss = document.getElementById('install-dismiss')  as HTMLButtonElement
const updateBanner   = document.getElementById('update-banner')    as HTMLDivElement
const updateBtn      = document.getElementById('update-btn')       as HTMLButtonElement
const offlineBanner  = document.getElementById('offline-banner')   as HTMLDivElement

// ── State ────────────────────────────────────────────────────────────────────

let deferredInstallPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null
const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true

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
  interj: 'межд.',
  pron: 'мест.',
  conj: 'съюз',
  det: 'опред.',
}

const GENDER_LABEL: Record<string, string> = {
  m: 'м.р.',
  f: 'ж.р.',
  n: 'ср.р.',
}

// ── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(dark: boolean): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  themeToggle.textContent = dark ? '☀️' : '🌙'
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}

function initTheme(): void {
  const stored = localStorage.getItem('theme')
  if (stored) {
    applyTheme(stored === 'dark')
  } else {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  applyTheme(!isDark)
})

initTheme()

// ── Direction indicator (read-only, auto-detected) ───────────────────────────

function updateDirIndicator(): void {
  const q = searchInput.value
  if (!q) { dirIndicator.textContent = ''; return }
  dirIndicator.textContent = detectDirection(q) === 'bg-en' ? 'БГ→АН' : 'АН→БГ'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function posTag(pos: string): string {
  if (!pos) return ''
  return `<span class="pos-tag">${escHtml(POS_LABEL[pos] ?? pos)}</span>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightPrefix(word: string, prefix: string): string {
  if (!prefix) return escHtml(word)
  const fw = fold(word), fp = fold(prefix)
  if (!fw.startsWith(fp)) return escHtml(word)
  // Walk the original string counting fp.length non-accent chars so that
  // the split point is correct even when U+0301 sits between characters,
  // e.g. "ко\u0301тка" with prefix "котка" → split after index 6 not 5.
  let foldedCount = 0, splitIdx = 0
  for (splitIdx = 0; splitIdx < word.length && foldedCount < fp.length; splitIdx++) {
    if (word[splitIdx] !== '\u0301') foldedCount++
  }
  return `<mark>${escHtml(word.slice(0, splitIdx))}</mark>${escHtml(word.slice(splitIdx))}`
}

/**
 * Extract a leading "(domain, label)" parenthetical from a sense string.
 * Returns { domain, rest } — rest may be empty.
 */
function extractDomain(sense: string): { domain: string; rest: string } {
  const m = sense.match(/^\(([^)]+)\)\s*(.*)$/s)
  if (m) return { domain: m[1], rest: m[2].trim() }
  return { domain: '', rest: sense }
}

// ── Recent searches (T17) ────────────────────────────────────────────────────

const RECENT_KEY = 'recent-searches'
const RECENT_MAX = 8

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function addRecent(query: string): void {
  if (!query) return
  const recent = getRecent().filter(q => q !== query)
  recent.unshift(query)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_MAX)))
}

// ── Empty state (T16 + T17 + T21) ───────────────────────────────────────────

const EXAMPLES_BG = ['баба', 'котка', 'любов', 'работа', 'вода']
const EXAMPLES_EN = ['house', 'beautiful', 'quickly', 'love', 'water']

function renderEmptyState(): void {
  const showIOSHint  = isIOS && !isStandalone && localStorage.getItem('ios-hint-dismissed') !== '1'

  const recent = getRecent()
  const html: string[] = []
  html.push('<div class="empty-state">')

  // ── Recent searches (T17) ─────────────────────────────────────────────────
  if (recent.length > 0) {
    html.push('<div class="empty-section">')
    html.push('<p class="empty-label">Скорошни / Recent</p>')
    html.push('<div class="chip-row">')
    for (const q of recent) {
      html.push(`<button class="chip chip-recent" data-search="${escHtml(q)}">${escHtml(q)}</button>`)
    }
    html.push('</div>')
    html.push('</div>')
  }

  // ── Example searches (T21) ────────────────────────────────────────────────
  html.push('<div class="empty-section">')
  html.push('<p class="empty-label">Примери / Examples</p>')
  html.push('<div class="chip-row">')
  for (const w of EXAMPLES_BG) {
    html.push(`<button class="chip chip-example" data-search="${escHtml(w)}">${escHtml(w)}</button>`)
  }
  html.push('<span class="chip-sep">·</span>')
  for (const w of EXAMPLES_EN) {
    html.push(`<button class="chip chip-example" data-search="${escHtml(w)}">${escHtml(w)}</button>`)
  }
  html.push('</div>')
  html.push('</div>')

  // ── iOS "Add to Home Screen" hint (T16) ──────────────────────────────────
  if (showIOSHint) {
    html.push(`
      <div class="ios-hint" id="ios-hint" role="note">
        <span class="ios-hint-icon">📲</span>
        <div class="ios-hint-text">
          <strong>Добави в началния екран / Add to Home Screen:</strong><br>
          Натисни <strong>Сподели</strong> (□↑) → <strong>Добави към началния екран</strong>
        </div>
        <button class="ios-hint-dismiss" id="ios-hint-dismiss" aria-label="Dismiss">✕</button>
      </div>`)
  }

  html.push('</div>')
  resultsEl.innerHTML = html.join('')

  // Wire chip clicks
  resultsEl.querySelectorAll<HTMLButtonElement>('.chip[data-search]').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset['search'] ?? ''
      if (!q) return
      searchInput.value = q
      runSearch(true)
      searchInput.focus()
    })
  })

  // Wire iOS hint dismiss (T16)
  document.getElementById('ios-hint-dismiss')?.addEventListener('click', () => {
    localStorage.setItem('ios-hint-dismissed', '1')
    document.getElementById('ios-hint')?.remove()
  })
}

// ── Rendering ────────────────────────────────────────────────────────────────

let lastQuery = ''

function renderEntries(entries: Entry[], dir: Direction): void {
  if (!entries.length) {
    resultsEl.innerHTML = '<p class="no-results">Няма резултати / No results</p>'
    return
  }

  // Group consecutive entries by headword
  const grouped = new Map<string, Entry[]>()
  for (const e of entries) {
    const arr = grouped.get(e[0]) ?? []
    arr.push(e)
    grouped.set(e[0], arr)
  }

  const wordCount = grouped.size
  const limitHit  = entries.length >= 40
  const countLabel = limitHit
    ? `${wordCount}+ думи / words`
    : `${wordCount} ${wordCount === 1 ? 'дума / word' : 'думи / words'}`
  const dirLabel = dir === 'bg-en' ? 'БГ → АН' : 'АН → БГ'

  // Feature-detect Web Share API (T20)
  const canShare = typeof navigator.share === 'function'

  const html: string[] = []
  html.push(`<p class="result-count">${escHtml(countLabel)} · ${escHtml(dirLabel)}</p>`)

  for (const [word, group] of grouped) {
    const meta    = getMeta(word, dir)
    const wiktUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`
    const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(word)}`

    html.push(`<article class="result-card" role="listitem">`)

    // ── Headword line ───────────────────────────────────────────────────────
    html.push(`<div class="headword-line">`)
    html.push(`<h2 class="headword">${highlightPrefix(word, lastQuery)}`)

    if (meta?.ipa) {
      html.push(` <span class="ipa">${escHtml(meta.ipa)}</span>`)
    }
    html.push(`</h2>`)

    // Gender badge
    if (meta?.gender) {
      html.push(`<span class="gender-badge">${escHtml(GENDER_LABEL[meta.gender] ?? meta.gender)}</span>`)
    }

    // Aspect badge + paired form (BG verbs)
    if (meta?.aspect) {
      const aspLabel = meta.aspect === 'impf' ? 'несв.' : 'св.'
      html.push(`<span class="aspect-badge">${aspLabel}</span>`)
      if (meta.paired) {
        const pairedLabel = meta.aspect === 'impf' ? 'св.:' : 'несв.:'
        html.push(`<span class="inflect">${pairedLabel} <em>${escHtml(meta.paired)}</em></span>`)
      }
    }

    // Plural (BG мн.ч. or EN irregular)
    if (meta?.pl) {
      const plLabel = dir === 'bg-en' ? 'мн.:' : 'pl:'
      html.push(`<span class="inflect">${plLabel} <em>${escHtml(meta.pl)}</em></span>`)
    }

    // EN: past tense + past participle
    if (meta?.past) {
      html.push(`<span class="inflect">past: <em>${escHtml(meta.past)}</em></span>`)
      if (meta.pp && meta.pp !== meta.past) {
        html.push(`<span class="inflect">pp: <em>${escHtml(meta.pp)}</em></span>`)
      }
    }

    // EN: comparative + superlative
    if (meta?.cmp) {
      html.push(`<span class="inflect">cmp: <em>${escHtml(meta.cmp)}</em></span>`)
      if (meta.sup) html.push(`<span class="inflect">sup: <em>${escHtml(meta.sup)}</em></span>`)
    }

    // Meaning count badge (when >1)
    if (group.length > 1) {
      html.push(`<span class="meaning-count">${group.length} знач.</span>`)
    }

    // Web Share button (T20) — only when API is available
    if (canShare) {
      html.push(`<button class="share-btn" data-share-word="${escHtml(word)}" data-share-url="${escHtml(shareUrl)}" aria-label="Share ${escHtml(word)}" title="Сподели / Share">🔗</button>`)
    }

    // Wiktionary link (when no share button, always; when share button, still show but smaller)
    html.push(`<a class="wikt-link" href="${escHtml(wiktUrl)}" target="_blank" rel="noopener noreferrer" title="Open in Wiktionary" aria-label="Wiktionary entry for ${escHtml(word)}">📖</a>`)

    html.push(`</div>`) // .headword-line

    // ── Meanings ────────────────────────────────────────────────────────────
    const numbered = group.length > 1

    group.forEach((entry, idx) => {
      const [, trans, sense, pos] = entry
      const translations = trans.split(' | ').map(t => t.trim()).filter(Boolean)
      const { domain, rest: cleanSense } = extractDomain(sense)

      html.push(`<div class="translation-row">`)

      // Row header: number · POS · domain · translation-count
      html.push(`<div class="row-header">`)
      if (numbered) html.push(`<span class="meaning-num">${idx + 1}.</span>`)
      if (pos)      html.push(posTag(pos))
      if (domain)   html.push(`<span class="domain-badge">${escHtml(domain)}</span>`)
      if (translations.length > 1) {
        html.push(`<span class="trans-count">${translations.length}</span>`)
      }
      html.push(`</div>`) // .row-header

      // Translations — each is a reverse-lookup button + copy button
      html.push(`<div class="trans-main">`)
      html.push(
        translations.map(t =>
          `<span class="trans" data-word="${escHtml(t)}" role="button" tabindex="0" title="Search '${escHtml(t)}'">` +
            escHtml(t) +
          `</span>` +
          `<button class="copy-btn" data-copy="${escHtml(t)}" aria-label="Copy ${escHtml(t)}" title="Copy">📋</button>`
        ).join(`<span class="sep"> · </span>`)
      )
      html.push(`</div>`) // .trans-main

      // BG word details (gender, plural, aspect) — shown when searching EN→BG
      const bgDetails: string[] = []
      if (dir === 'en-bg') {
        for (const t of translations) {
          const bgMeta = getMeta(t, 'bg-en')
          if (!bgMeta) continue
          const parts: string[] = [`<span class="bg-detail-word">${escHtml(t)}</span>`]
          if (bgMeta.ipa)    parts.push(`<span class="ipa">${escHtml(bgMeta.ipa)}</span>`)
          if (bgMeta.gender) parts.push(`<span class="gender-badge">${escHtml(GENDER_LABEL[bgMeta.gender] ?? bgMeta.gender)}</span>`)
          if (bgMeta.aspect) {
            const aspLabel = bgMeta.aspect === 'impf' ? 'несв.' : 'св.'
            parts.push(`<span class="aspect-badge">${aspLabel}</span>`)
            if (bgMeta.paired) {
              const pairedLabel = bgMeta.aspect === 'impf' ? 'св.:' : 'несв.:'
              parts.push(`<span class="inflect">${pairedLabel} <em>${escHtml(bgMeta.paired)}</em></span>`)
            }
          }
          if (bgMeta.pl) parts.push(`<span class="inflect">мн.: <em>${escHtml(bgMeta.pl)}</em></span>`)
          if (parts.length > 1) bgDetails.push(`<span class="bg-detail-entry">${parts.join(' ')}</span>`)
        }
        if (bgDetails.length) {
          html.push(`<div class="bg-details">${bgDetails.join('')}</div>`)
        }
      }

      // EN word details (IPA, irregular forms) — shown when searching BG→EN
      const enDetails: string[] = []
      if (dir === 'bg-en') {
        for (const t of translations) {
          const enMeta = getMeta(t, 'en-bg')
          if (!enMeta) continue
          const parts: string[] = [`<span class="en-detail-word">${escHtml(t)}</span>`]
          if (enMeta.ipa)  parts.push(`<span class="ipa">${escHtml(enMeta.ipa)}</span>`)
          if (enMeta.pl)   parts.push(`<span class="inflect">pl: <em>${escHtml(enMeta.pl)}</em></span>`)
          if (enMeta.past) {
            parts.push(`<span class="inflect">past: <em>${escHtml(enMeta.past)}</em></span>`)
            if (enMeta.pp && enMeta.pp !== enMeta.past)
              parts.push(`<span class="inflect">pp: <em>${escHtml(enMeta.pp)}</em></span>`)
          }
          if (enMeta.cmp) {
            parts.push(`<span class="inflect">cmp: <em>${escHtml(enMeta.cmp)}</em></span>`)
            if (enMeta.sup) parts.push(`<span class="inflect">sup: <em>${escHtml(enMeta.sup)}</em></span>`)
          }
          if (parts.length > 1) enDetails.push(`<span class="en-detail-entry">${parts.join(' ')}</span>`)
        }
        if (enDetails.length) {
          html.push(`<div class="en-details">${enDetails.join('')}</div>`)
        }
      }

      // Sense / definition — shown for BG→EN always; shown for EN→BG only when no BG details available
      if (cleanSense && (dir !== 'en-bg' || bgDetails.length === 0)) {
        const senses = cleanSense.split(' | ').map(s => s.trim()).filter(Boolean)
        if (senses.length === 1) {
          html.push(`<p class="sense">${escHtml(senses[0])}</p>`)
        } else {
          html.push(`<ol class="sense-list">`)
          for (const s of senses) html.push(`<li class="sense">${escHtml(s)}</li>`)
          html.push(`</ol>`)
        }
      }

      html.push(`</div>`) // .translation-row
    })

    html.push(`</article>`)
  }

  resultsEl.innerHTML = html.join('')

  // ── Copy buttons ──────────────────────────────────────────────────────────
  resultsEl.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset['copy'] ?? ''
      const succeed = () => {
        btn.textContent = '✓'
        btn.classList.add('copied')
        setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied') }, 1500)
      }
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(text).then(succeed)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta); succeed()
      }
    })
  })

  // ── Web Share buttons (T20) ───────────────────────────────────────────────
  resultsEl.querySelectorAll<HTMLButtonElement>('.share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = btn.dataset['shareWord'] ?? ''
      const url  = btn.dataset['shareUrl']  ?? ''
      void navigator.share({ title: `${word} — БГ–АН Речник`, url }).catch(() => {/* user cancelled */})
    })
  })

  // ── Reverse lookup — click a translation chip to search it ───────────────
  resultsEl.querySelectorAll<HTMLElement>('.trans[data-word]').forEach(el => {
    const activate = () => {
      const word = el.dataset['word'] ?? ''
      if (!word) return
      searchInput.value = word
      runSearch(true)
      searchInput.focus()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    el.addEventListener('click', activate)
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
    })
  })
}

// ── URL state ────────────────────────────────────────────────────────────────

function pushUrlState(query: string): void {
  const url = new URL(window.location.href)
  query ? url.searchParams.set('q', query) : url.searchParams.delete('q')
  url.searchParams.delete('dir')
  history.replaceState(null, '', url.toString())
}

function readUrlState(): string {
  return new URL(window.location.href).searchParams.get('q') ?? ''
}

// ── Search ───────────────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout> | null = null

function runSearch(saveToRecent = false): void {
  const query = searchInput.value.trim()

  // T18: page title tracks query
  document.title = query ? `${query} — БГ–АН Речник` : 'БГ–АН Речник'

  if (!query) {
    dirIndicator.textContent = ''
    pushUrlState('')
    renderEmptyState()
    return
  }

  // T19: scroll to top on new search
  window.scrollTo({ top: 0 })

  const dir = detectDirection(query)
  updateDirIndicator()
  pushUrlState(query)
  lastQuery = query

  // T17: remember this search (only on explicit submit)
  if (saveToRecent) addRecent(query)

  renderEntries(searchPrefix(dir, query, 40), dir)
}

searchInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 120)
})

searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') { if (searchTimer) clearTimeout(searchTimer); runSearch(true) }
  if (e.key === 'Escape') {
    searchInput.value = ''
    dirIndicator.textContent = ''
    pushUrlState('')
    document.title = 'БГ–АН Речник'
    renderEmptyState()
  }
})

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault(); searchInput.focus(); searchInput.select()
  }
})

// ── Progress bar ─────────────────────────────────────────────────────────────

function setProgress(pct: number): void {
  progressFill.style.width = `${pct}%`
  if (pct >= 100) setTimeout(() => progressTrack.classList.add('hidden'), 400)
}

// ── Boot ─────────────────────────────────────────────────────────────────────

function setStatus(msg: string, error = false): void {
  statusBar.textContent = msg
  statusBar.classList.toggle('hidden', !msg)
  statusBar.classList.toggle('status-error', error)
}

async function boot(): Promise<void> {
  setStatus('Зарежда речника… / Loading dictionary…')
  setProgress(0)
  try {
    await loadDictionary((pct: number) => {
      setProgress(pct)
      if (pct < 100) {
        setStatus(`Зарежда… ${pct}%`)
      } else {
        setStatus('')
        const q = readUrlState()
        if (q) {
          searchInput.value = q
          runSearch()
        } else {
          renderEmptyState()
        }
        searchInput.focus()
      }
    })
  } catch (err) {
    setStatus('Грешка при зареждане. Проверете интернет връзката. / Load error — check connection.', true)
    console.error(err)
  }
}

void boot()

// ── iOS PWA: focus search field on every app open ────────────────────────────
// On iOS, .focus() only raises the keyboard when called inside a synchronous
// browser-lifecycle event handler (pageshow fires on both fresh launch and
// app-resume from the home screen).  navigator.standalone is true only when
// running as an installed PWA on iOS.
if (isIOS && isStandalone) {
  window.addEventListener('pageshow', () => {
    // rAF lets the page finish painting before we steal focus
    requestAnimationFrame(() => searchInput.focus())
  })
}

// ── PWA: Install ─────────────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredInstallPrompt = e as typeof deferredInstallPrompt
  installBanner.classList.remove('hidden')
})

installBtn.addEventListener('click', () => {
  if (!deferredInstallPrompt) return
  void (async () => {
    await deferredInstallPrompt!.prompt()
    const result = await deferredInstallPrompt!.userChoice
    if (result.outcome === 'accepted') installBanner.classList.add('hidden')
    deferredInstallPrompt = null
  })()
})

installDismiss.addEventListener('click', () => installBanner.classList.add('hidden'))
window.addEventListener('appinstalled', () => installBanner.classList.add('hidden'))

// ── PWA: Update ──────────────────────────────────────────────────────────────

document.addEventListener('sw-update-available', () => updateBanner.classList.remove('hidden'))
updateBtn.addEventListener('click', () => { updateBanner.classList.add('hidden'); window.location.reload() })

// ── Offline / Online status banner (T22) ─────────────────────────────────────

function updateOfflineBanner(): void {
  if (navigator.onLine) {
    offlineBanner.classList.add('hidden')
  } else {
    offlineBanner.classList.remove('hidden')
  }
}

window.addEventListener('online',  updateOfflineBanner)
window.addEventListener('offline', updateOfflineBanner)
// Set initial state (in case page loads while offline)
updateOfflineBanner()
