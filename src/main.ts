import { loadDictionary, searchPrefix, detectDirection, getMeta, type Direction, type Entry } from './search'

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

// ── State ────────────────────────────────────────────────────────────────────

let deferredInstallPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null

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
  return `<span class="pos-tag">${POS_LABEL[pos] ?? pos}</span>`
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
  if (word.toLowerCase().startsWith(prefix.toLowerCase())) {
    return `<mark>${escHtml(word.slice(0, prefix.length))}</mark>${escHtml(word.slice(prefix.length))}`
  }
  return escHtml(word)
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

  const html: string[] = []
  html.push(`<p class="result-count">${escHtml(countLabel)} · ${escHtml(dirLabel)}</p>`)

  for (const [word, group] of grouped) {
    const meta    = getMeta(word, dir)
    const wiktUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`

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
      html.push(`<span class="gender-badge">${GENDER_LABEL[meta.gender] ?? meta.gender}</span>`)
    }

    // Aspect badge + paired form
    if (meta?.aspect) {
      const aspLabel = meta.aspect === 'impf' ? 'несв.' : 'св.'
      html.push(`<span class="aspect-badge">${aspLabel}</span>`)
      if (meta.paired) {
        const pairedLabel = meta.aspect === 'impf' ? 'св.:' : 'несв.:'
        html.push(`<span class="inflect">${pairedLabel} <em>${escHtml(meta.paired)}</em></span>`)
      }
    }

    // Plural
    if (meta?.pl) {
      html.push(`<span class="inflect">мн.: <em>${escHtml(meta.pl)}</em></span>`)
    }

    // Meaning count badge (when >1)
    if (group.length > 1) {
      html.push(`<span class="meaning-count">${group.length} знач.</span>`)
    }

    // Wiktionary link
    html.push(`<a class="wikt-link" href="${escHtml(wiktUrl)}" target="_blank" rel="noopener noreferrer" title="Open in Wiktionary" aria-label="Wiktionary entry for ${escHtml(word)}">🔗</a>`)

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

      // Sense / definition
      if (cleanSense) {
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

  // ── Reverse lookup — click a translation chip to search it ───────────────
  resultsEl.querySelectorAll<HTMLElement>('.trans[data-word]').forEach(el => {
    const activate = () => {
      const word = el.dataset['word'] ?? ''
      if (!word) return
      searchInput.value = word
      runSearch()
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

function runSearch(): void {
  const query = searchInput.value.trim()
  if (!query) {
    resultsEl.innerHTML = ''
    dirIndicator.textContent = ''
    pushUrlState('')
    return
  }
  const dir = detectDirection(query)
  updateDirIndicator()
  pushUrlState(query)
  lastQuery = query
  renderEntries(searchPrefix(dir, query, 40), dir)
}

searchInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 120)
})

searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') { if (searchTimer) clearTimeout(searchTimer); runSearch() }
  if (e.key === 'Escape') {
    searchInput.value = ''; resultsEl.innerHTML = ''
    dirIndicator.textContent = ''; pushUrlState('')
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
        if (q) { searchInput.value = q; runSearch() }
        searchInput.focus()
      }
    })
  } catch (err) {
    setStatus('Грешка при зареждане. Проверете интернет връзката. / Load error — check connection.', true)
    console.error(err)
  }
}

void boot()

// ── PWA: Install ─────────────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredInstallPrompt = e as typeof deferredInstallPrompt
  installBanner.classList.remove('hidden')
})

installBtn.addEventListener('click', () => {
  if (!deferredInstallPrompt) return
  void deferredInstallPrompt.prompt().then(async () => {
    const result = await deferredInstallPrompt!.userChoice
    if (result.outcome === 'accepted') installBanner.classList.add('hidden')
    deferredInstallPrompt = null
  })
})

installDismiss.addEventListener('click', () => installBanner.classList.add('hidden'))
window.addEventListener('appinstalled', () => installBanner.classList.add('hidden'))

// ── PWA: Update ──────────────────────────────────────────────────────────────

document.addEventListener('sw-update-available', () => updateBanner.classList.remove('hidden'))
updateBtn.addEventListener('click', () => { updateBanner.classList.add('hidden'); window.location.reload() })
