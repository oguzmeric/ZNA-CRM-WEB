// Playwright ile ZNA CRM ekranlarını yakalar, public/pitch/*.png olarak kaydeder.
// Kullanım: pnpm exec node scripts/pitch-capture.mjs
// Ön koşul: Vite dev server (pnpm dev) http://localhost:3000'de ayakta olmalı.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'public', 'pitch')
await mkdir(OUT, { recursive: true })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const USER = process.env.CRM_USER || 'oguzmeric'
const PASS = process.env.CRM_PASS || 'zna2026'

const sayfalar = [
  { yol: '/dashboard',        ad: 'panel',              bekle: 3500 },
  { yol: '/musteriler',       ad: 'musteriler',         bekle: 3500 },
  { yol: '/gorevler',         ad: 'gorevler',           bekle: 3500 },
  { yol: '/gorusmeler',       ad: 'gorusmeler',         bekle: 3500 },
  { yol: '/teklifler',        ad: 'teklifler',          bekle: 3500 },
  { yol: '/trassir-lisanslar',ad: 'trassir-lisanslar',  bekle: 4500 },
  { yol: '/servis-talepleri', ad: 'servis-talepleri',   bekle: 4000 },
  { yol: '/stok',             ad: 'stok',               bekle: 3500 },
  { yol: '/takvim',           ad: 'takvim',             bekle: 3500 },
]

console.log('[pitch] browser başlatılıyor…')
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

console.log('[pitch] login sayfası açılıyor…')
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

console.log('[pitch] giriş yapılıyor…')
const inputs = await page.locator('input').all()
await inputs[0].fill(USER)
await inputs[1].fill(PASS)
await page.locator('form').evaluate((f) => f.requestSubmit())
await page.waitForURL(/dashboard|gorusmeler|musteriler/, { timeout: 15000 })
await page.waitForTimeout(2500)
console.log('[pitch] giriş başarılı — sayfalar taranıyor')

for (const s of sayfalar) {
  console.log(`[pitch] ${s.ad} → ${s.yol}`)
  await page.goto(BASE + s.yol, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(s.bekle)
  const p = path.join(OUT, `${s.ad}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`   ✓ ${p}`)
}

// Zeyna panelini açıp ekrana bas
console.log('[pitch] Zeyna paneli açılıyor…')
await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const zeynaFab = page.locator('.zeyna-fab').first()
if (await zeynaFab.count()) {
  await zeynaFab.click({ force: true })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, 'zeyna-panel.png'), fullPage: false })
  console.log('   ✓ zeyna-panel.png')
}

// Bir müşteri detayı — ilk satıra tıkla
console.log('[pitch] müşteri detay örneği…')
await page.goto(BASE + '/musteriler', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const ilkSatir = page.locator('tbody tr').first()
if (await ilkSatir.count()) {
  const link = ilkSatir.locator('a, [role=button]').first()
  if (await link.count()) await link.click()
  else await ilkSatir.click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(OUT, 'musteri-detay.png'), fullPage: false })
  console.log('   ✓ musteri-detay.png')
}

await browser.close()
console.log('[pitch] bitti — dosyalar: public/pitch/*.png')
