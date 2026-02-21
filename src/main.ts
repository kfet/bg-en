import { loadDictionary, searchPrefix, detectDirection, type Direction, type Entry } from './search'

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
  if (!q) {
    dirIndicator.textContent = ''
    return
  }
  const detected = detectDirection(q)
  dirIndicator.textContent = detected === 'bg-en' ? 'БГ→АН' : 'АН→БГ'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function posTag(pos: string): string {
  if (!pos) return ''
  const label = POS_LABEL[pos] ?? pos
  return `<span class="pos-tag">${label}</span>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Highlight the matched prefix in a headword. Case-preserving.
 * e.g. highlightPrefix('БАБА', 'баб') → '<mark>БАБ</mark>А'
 */
function highlightPrefix(word: string, prefix: string): string {
  if (!prefix) return escHtml(word)
  const p = prefix.toLowerCase()
  const w = word.toLowerCase()
  if (w.startsWith(p)) {
    return `<mark>${escHtml(word.slice(0, prefix.length))}</mark>${escHtml(word.slice(prefix.length))}`
  }
  return escHtml(word)
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
  const limitHit = entries.length >= 40
  const countLabel = limitHit
    ? `${wordCount}+ думи / words`
    : `${wordCount} ${wordCount === 1 ? 'дума / word' : 'думи / words'}`

  const dirLabel = dir === 'bg-en' ? 'БГ → АН' : 'АН → БГ'

  const html: string[] = []
  html.push(`<p class="result-count" aria-live="polite">${escHtml(countLabel)} · ${escHtml(dirLabel)}</p>`)

  for (const [word, group] of grouped) {
    html.push(`<article class="result-card" role="listitem">`)
    html.push(`<h2 class="headword">${highlightPrefix(word, lastQuery)}</h2>`)

    for (const [, trans, sense, pos] of group) {
      const translations = trans.split(' | ').map(t => t.trim()).filter(Boolean)

      html.push(`<div class="translation-row">`)

      // POS + translation chips
      html.push(`<div class="trans-main">${posTag(pos)}`)
      html.push(
        translations.map(t =>
          `<span class="trans">${escHtml(t)}</span>` +
          `<button class="copy-btn" aria-label="Copy ${escHtml(t)}" data-copy="${escHtml(t)}" title="Copy">📋</button>`
        ).join(`<span class="sep"> · </span>`)
      )
      html.push(`</div>`)

      // Sense lines — split " | " into individual items
      if (sense) {
        const senses = sense.split(' | ').map(s => s.trim()).filter(Boolean)
        if (senses.length === 1) {
          html.push(`<p class="sense">${escHtml(senses[0])}</p>`)
        } else {
          html.push(`<ol class="sense-list">`)
          for (const s of senses) {
            html.push(`<li class="sense">${escHtml(s)}</li>`)
          }
          html.push(`</ol>`)
        }
      }

      html.push(`</div>`) // .translation-row
    }

    html.push(`</article>`)
  }

  resultsEl.innerHTML = html.join('')

  // Attach copy button handlers
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
        // Fallback for HTTP contexts or older browsers
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        succeed()
      }
    })
  })
}

// ── URL state sync ────────────────────────────────────────────────────────────

function pushUrlState(query: string): void {
  const url = new URL(window.location.href)
  if (query) {
    url.searchParams.set('q', query)
  } else {
    url.searchParams.delete('q')
  }
  url.searchParams.delete('dir') // no longer used
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
    updateDirIndicator()
    pushUrlState('')
    return
  }

  const dir: Direction = detectDirection(query)
  updateDirIndicator()
  pushUrlState(query)
  lastQuery = query
  const results = searchPrefix(dir, query, 40)
  renderEntries(results, dir)
}

searchInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 120)
})

searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    if (searchTimer) clearTimeout(searchTimer)
    runSearch()
  }
  if (e.key === 'Escape') {
    searchInput.value = ''
    resultsEl.innerHTML = ''
    dirIndicator.textContent = ''
    pushUrlState('')
  }
})

// Ctrl+L / Cmd+L focuses search input
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault()
    searchInput.focus()
    searchInput.select()
  }
})

// ── Progress bar ─────────────────────────────────────────────────────────────

function setProgress(pct: number): void {
  progressFill.style.width = `${pct}%`
  if (pct >= 100) {
    setTimeout(() => {
      progressTrack.classList.add('hidden')
    }, 400)
  }
}

// ── Boot / data loading ──────────────────────────────────────────────────────

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
        // Restore search state from URL, then focus
        const q = readUrlState()
        if (q) {
          searchInput.value = q
          runSearch()
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

// ── PWA: Install prompt ──────────────────────────────────────────────────────

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

installDismiss.addEventListener('click', () => {
  installBanner.classList.add('hidden')
})

window.addEventListener('appinstalled', () => {
  installBanner.classList.add('hidden')
})

// ── PWA: Update notification ─────────────────────────────────────────────────

document.addEventListener('sw-update-available', () => {
  updateBanner.classList.remove('hidden')
})

updateBtn.addEventListener('click', () => {
  updateBanner.classList.add('hidden')
  window.location.reload()
})
