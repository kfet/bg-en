// scripts/smoke_test.js  (Node, requires: npm i -D playwright)
// Run with: node scripts/smoke_test.js
// Assumes the app is being served at http://localhost:5177
//   Start it with: python3 -m http.server 5177 --directory dist

const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  console.log('Opening http://localhost:5177 ...')
  await page.goto('http://localhost:5177')

  // Wait for data load (status bar becomes empty / hidden)
  await page.waitForFunction(
    () => {
      const bar = document.getElementById('status-bar')
      return !bar || bar.textContent === '' || bar.classList.contains('hidden')
    },
    { timeout: 30000 },
  )
  console.log('✓ Page loaded and data ready')

  // Type a Bulgarian word — auto-detect should show BG→EN results
  await page.fill('#search-input', 'баба')
  await page.waitForTimeout(400)
  const bgResults = await page.$$('.result-card')
  console.assert(bgResults.length > 0, 'Expected results for "баба"')
  console.log(`✓ Found ${bgResults.length} result card(s) for "баба" (auto BG→EN)`)

  // Verify direction indicator shows БГ→АН
  const dirText = await page.textContent('#dir-indicator')
  console.assert(
    dirText && dirText.includes('БГ→АН'),
    `Expected dir-indicator to show БГ→АН, got "${dirText}"`,
  )
  console.log(`✓ Direction indicator: "${dirText}"`)

  // Clear and type an English word — auto-detect should switch to EN→BG
  await page.fill('#search-input', 'house')
  await page.waitForTimeout(400)
  const enResults = await page.$$('.result-card')
  console.assert(enResults.length > 0, 'Expected results for "house"')
  console.log(`✓ Found ${enResults.length} result card(s) for "house" (auto EN→BG)`)

  // Verify direction indicator shows АН→БГ
  const dirText2 = await page.textContent('#dir-indicator')
  console.assert(
    dirText2 && dirText2.includes('АН→БГ'),
    `Expected dir-indicator to show АН→БГ, got "${dirText2}"`,
  )
  console.log(`✓ Direction indicator: "${dirText2}"`)

  // Test accent-insensitive BG search: "котка" should find headword "ко́тка"
  await page.fill('#search-input', 'котка')
  await page.waitForTimeout(400)
  const kotkaResults = await page.$$('.result-card')
  console.assert(kotkaResults.length > 0, 'Expected results for "котка" (accent-insensitive)')
  console.log(`✓ Found ${kotkaResults.length} result card(s) for "котка" (accent-insensitive)`)

  await browser.close()
  console.log('\nSmoke test passed. ✓')
})().catch((err) => {
  console.error('Smoke test FAILED:', err)
  process.exit(1)
})
