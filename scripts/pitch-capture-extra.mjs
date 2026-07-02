import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'public', 'pitch')
const BASE = 'http://localhost:3000'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const inputs = await page.locator('input').all()
await inputs[0].fill('oguzmeric')
await inputs[1].fill('zna2026')
await page.locator('form').evaluate((f) => f.requestSubmit())
await page.waitForURL(/dashboard|gorusmeler|musteriler/, { timeout: 15000 })
await page.waitForTimeout(2500)

// Zeyna
console.log('[extra] zeyna')
await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('.zeyna-fab').first().click({ force: true })
await page.waitForTimeout(2500)
await page.screenshot({ path: path.join(OUT, 'zeyna-panel.png') })
console.log('   ✓ zeyna-panel.png')

// Musteri detay
console.log('[extra] musteri-detay')
await page.goto(BASE + '/musteriler', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const linkler = page.locator('tbody tr a')
if (await linkler.count()) {
  await linkler.first().click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(OUT, 'musteri-detay.png') })
  console.log('   ✓ musteri-detay.png')
}

// Yeni gorusme formu — Gorusmeler + Yeni gorusme click
console.log('[extra] yeni-gorusme')
await page.goto(BASE + '/gorusmeler', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const yg = page.locator('button', { hasText: 'Yeni görüşme' }).first()
if (await yg.count()) {
  await yg.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(OUT, 'yeni-gorusme.png') })
  console.log('   ✓ yeni-gorusme.png')
}
await browser.close()
console.log('bitti')
