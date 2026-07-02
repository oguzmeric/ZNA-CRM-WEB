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

console.log('[talep] servis-talepleri listesi')
await page.goto(BASE + '/servis-talepleri', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// İlk satırdaki 'detay' bağlantısına tıkla
const rows = page.locator('tbody tr')
const count = await rows.count()
console.log('[talep] satır sayısı:', count)
if (count) {
  // detay için satıra tıkla (herhangi bir link/hücre)
  const firstLink = rows.first().locator('a, [role=link]').first()
  if (await firstLink.count()) {
    await firstLink.click()
  } else {
    await rows.first().click()
  }
  await page.waitForTimeout(4500)
  await page.screenshot({ path: path.join(OUT, 'talep-detay.png') })
  console.log('   ✓ talep-detay.png')
}

await browser.close()
