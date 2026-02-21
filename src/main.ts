import { loadDictionary, searchPrefix, detectDirection, type Direction, type Entry } from './search'

// ── Elements ────────────────────────────────────────────────────────────────

const searchInput    = document.getElementById('search-input')    as HTMLInputElement
const resultsEl      = document.getElementById('results')          as HTMLDivElement
const statusBar      = document.getElementById('status-bar')       as HTMLDivElement
const progressTrack  = document.getElementById('progress-track')   as HTMLDivElement
const progressFill   = document.getElementById('progress-fill')    as HTMLDivElement
const btnBgEn        = document.getElementById('btn-bg-en')        as HTMLButtonElement
const btnEnBg        = document.getElementById('btn-en-bg')        as HTMLButtonElement
const btnAuto        = document.getElementById('btn-auto')         as HTMLButtonElement
const dirIndicator   = document.getElementById('dir-indicator')    as HTMLSpanElement
const themeToggle    = document.getElementById('theme-toggle')     as HTMLButtonElement
const installBanner  = document.getElementById('install-banner')   as HTMLDivElement
const installBtn     = document.getElementById('install-btn')      as HTMLButtonElement
const installDismiss = document.getElementById('install-dismiss')  as HTMLButtonElement
const updateBanner   = document.getElementById('update-banner')    as HTMLDivElement
const updateBtn      = document.getElementById('update-btn')       as HTMLButtonElement

// ── State ────────────────────────────────────────────────────────────────────

let direction: Direction | 'auto' = 'auto'
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

// ── Direction toggle ─────────────────────────────────────────────────────────

function setDirection(d: Direction | 'auto'): void {
  direction = d
  btnBgEn.classList.toggle('active', d === 'bg-en')
  btnEnBg.classList.toggle('active', d === 'en-bg')
  btnAuto.classList.toggle('active', d === 'auto')
  btnBgEn.setAttribute('aria-pressed', String(d === 'bg-en'))
  btnEnBg.setAttribute('aria-pressed', String(d === 'en-bg'))
  btnAuto.setAttribute('aria-pressed', String(d === 'auto'))
  updateDirIndicator()
  if (searchInput.value.trim()) runSearch()
}

function updateDirIndicator(): void {
  if (direction !== 'auto') {
    dirIndicator.textContent = ''
    return
  }
  const q = searchInput.value
  if (!q) {
    dirIndicator.textContent = ''
    return
  }
  const detected = detectDirection(q)
  dirIndicator.textContent = detected === 'bg-en' ? '🇧🇬→🇬🇧' : '🇬🇧→🇧🇬'
}

btnBgEn.addEventListener('click', () => setDirection('bg-en'))
btnEnBg.addEventListener('click', () => setDirection('en-bg'))
btnAuto.addEventListener('click', () => setDirection('auto'))

// ── Rendering ────────────────────────────────────────────────────────────────

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

let lastQuery = ''

function renderEntries(entries: Entry[]): void {
  if (!entries.length) {
    resultsEl.innerHTML = '<p class="no-results">Няма резултати / No results</p>'
    return
  }

  // Group by written_rep
  const grouped = new Map<string, Entry[]>()
  for (const e of entries) {
    const arr = grouped.get(e[0]) ?? []
    arr.push(e)
    grouped.set(e[0], arr)
  }

  const wordCount = grouped.size
  const limitHit = entries.length >= 40
  const countLabel = limitHit ? `${wordCount}+ думи / words` : `${wordCount} ${wordCount === 1 ? 'дума / word' : 'думи / words'}`

  const html: string[] = []
  html.push(`<p class="result-count" aria-live="polite">${escHtml(countLabel)}</p>`)
  for (const [word, group] of grouped) {
    html.push(`<article class="result-card" role="listitem">`)
    html.push(`<h2 class="headword">${highlightPrefix(word, lastQuery)}</h2>`)
    for (const [, trans, sense, pos] of group) {
      const translations = trans.split(' | ').map(t => t.trim()).filter(Boolean)
      html.push(`<div class="translation-row">`)
      html.push(
        `<div class="trans-main">${posTag(pos)}` +
        translations.map(t =>
          `<span class="trans">${escHtml(t)}</span>` +
          `<button class="copy-btn" aria-label="Copy translation" data-copy="${escHtml(t)}" title="Copy">📋</button>`
        ).join(`<span class="sep"> · </span>`) +
        `</div>`
      )
      if (sense) {
        html.push(`<div class="sense">${escHtml(sense)}</div>`)
      }
      html.push(`</div>`)
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

function pushUrlState(query: string, dir: Direction | 'auto'): void {
  const url = new URL(window.location.href)
  if (query) {
    url.searchParams.set('q', query)
    if (dir !== 'auto') {
      url.searchParams.set('dir', dir)
    } else {
      url.searchParams.delete('dir')
    }
  } else {
    url.searchParams.delete('q')
    url.searchParams.delete('dir')
  }
  history.replaceState(null, '', url.toString())
}

function readUrlState(): { query: string; dir: Direction | 'auto' } {
  const params = new URL(window.location.href).searchParams
  const q = params.get('q') ?? ''
  const dirParam = params.get('dir')
  const dir: Direction | 'auto' =
    dirParam === 'bg-en' || dirParam === 'en-bg' ? dirParam : 'auto'
  return { query: q, dir }
}

// ── Search ───────────────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout> | null = null

function runSearch(): void {
  const query = searchInput.value.trim()
  if (!query) {
    resultsEl.innerHTML = ''
    updateDirIndicator()
    pushUrlState('', direction)
    return
  }

  const dir: Direction = direction === 'auto' ? detectDirection(query) : direction
  updateDirIndicator()
  pushUrlState(query, direction)
  lastQuery = query
  const results = searchPrefix(dir, query, 40)
  renderEntries(results)
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
    pushUrlState('', 'auto')
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

function setStatus(msg: string): void {
  statusBar.textContent = msg
  statusBar.classList.toggle('hidden', !msg)
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
        const { query, dir } = readUrlState()
        if (query) {
          setDirection(dir)
          searchInput.value = query
          runSearch()
        }
        searchInput.focus()
      }
    })
  } catch (err) {
    setStatus('Грешка при зареждане. Проверете интернет връзката. / Load error — check connection.')
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
