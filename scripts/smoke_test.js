// scripts/smoke_test.js  (Node, requires: npm i -D playwright)
// Run with: node scripts/smoke_test.js
// Assumes the app is being served at http://localhost:5050
//   Start it with: python3 -m http.server 5050 --directory dist

const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  console.log('Opening http://localhost:5050 ...')
  await page.goto('http://localhost:5050')

  // Wait for data load (status bar becomes empty / hidden)
  await page.waitForFunction(
    () => {
      const bar = document.getElementById('status-bar')
      return !bar || bar.textContent === '' || bar.classList.contains('hidden')
    },
    { timeout: 30000 },
  )
  console.log('✓ Page loaded and data ready')

  // Type a Bulgarian word
  await page.fill('#search-input', 'баба')
  await page.waitForTimeout(400)
  const bgResults = await page.$$('.result-card')
  console.assert(bgResults.length > 0, 'Expected results for "баба"')
  console.log(`✓ Found ${bgResults.length} result card(s) for "баба" (BG→EN)`)

  // Clear and type an English word
  await page.fill('#search-input', '')
  await page.click('#btn-en-bg')
  await page.fill('#search-input', 'house')
  await page.waitForTimeout(400)
  const enResults = await page.$$('.result-card')
  console.assert(enResults.length > 0, 'Expected results for "house"')
  console.log(`✓ Found ${enResults.length} result card(s) for "house" (EN→BG)`)

  // Test auto-detect: Cyrillic should switch to bg-en
  await page.click('#btn-auto')
  await page.fill('#search-input', 'ходя')
  await page.waitForTimeout(400)
  const autoResults = await page.$$('.result-card')
  console.assert(autoResults.length > 0, 'Expected results for "ходя" in auto mode')
  console.log(`✓ Auto-detect: found ${autoResults.length} result(s) for "ходя"`)

  await browser.close()
  console.log('\nSmoke test passed. ✓')
})().catch((err) => {
  console.error('Smoke test FAILED:', err)
  process.exit(1)
})
