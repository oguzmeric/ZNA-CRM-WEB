// public/pitch/index.html -> print-ready PDF (nav gizli, animasyonlar kapalı,
// bölümler sayfa sonlarında kırılmasın diye break-inside guard'lı).
// Kullanım: pnpm exec node scripts/pitch-pdf.mjs

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'public', 'pitch', 'ZNA-CRM-Tanitim.pdf')
const URL = process.env.PITCH_URL || 'http://localhost:3000/pitch/index.html'

console.log('[pdf] browser başlatılıyor…')
const browser = await chromium.launch({ headless: true })
// 1240px genişlik, deviceScaleFactor 2 → yüksek çözünürlük
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

console.log('[pdf] sayfa yükleniyor:', URL)
await page.goto(URL, { waitUntil: 'networkidle' })

// Tüm görselleri bekle
await page.evaluate(async () => {
  const imgs = Array.from(document.querySelectorAll('img'))
  await Promise.all(imgs.map((i) => i.complete && i.naturalWidth > 0
    ? null
    : new Promise((r) => { i.onload = r; i.onerror = r })))
})
await page.waitForTimeout(1500)

// Print-mode stilleri: nav gizle, CTA linklerini nötrle, sticky'yi indir,
// section'lar sayfa aralarında bölünmesin, boyutları PDF genişliğine uydur.
await page.addStyleTag({ content: `
  /* animasyon ve geçiş yok */
  *, *::before, *::after { animation: none !important; transition: none !important; }

  /* nav bar tamamen kaldırıldı */
  nav.nav { display: none !important; }

  html, body { background: #f8fafc !important; margin: 0; padding: 0; }

  /* ============================================================
     NİZAMİ PDF DÜZENİ — her major section KENDİ sayfasında.
     Böylece hiçbir başlık/görsel iki sayfaya bölünmez, hiçbir
     arka plan geçişi ortadan kesilmez.
     ============================================================ */

  /* 1) Her section yeni sayfada başlar */
  section.section, section.stats, section.quote, section.cta,
  section.mobile-sec, footer.footer {
    break-before: page !important;
    page-break-before: always !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  section.hero { break-before: avoid !important; page-break-before: avoid !important; }

  /* 2) Her section EN AZ 1080 (sayfa boyu). Kısa içerikler dikey ortalanır.
     Uzun içerikler (mobile, modules) doğal büyür — 2 sayfaya taşarsa
     break-before rule'lar sayfa bütünlüğünü korur. */
  section.section, section.stats, section.quote, section.cta, section.mobile-sec, section.hero {
    min-height: 1080px !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: stretch !important;
    box-sizing: border-box !important;
  }
  section.hero { align-items: center !important; }
  section.stats { min-height: 320px !important; }   /* stats kısa strip, tam sayfa gerekmez */
  .footer, footer.footer { display: none !important; }

  .section-inner { width: 100% !important; margin: 0 auto !important; }

  /* 3) İç birimler yine asla bölünmesin (fallback) */
  .frow, .frow.rev, .mod, .tech, .stat, .tstep, .pf-item, .phone-real,
  .hero-shot, .fimg, .qm-row, .modules, .techgrid, .timeline, .phone-showcase,
  .section-head, .quote-metric, .quote-inner, .mobile-head, .cta-btns, .cta-meta {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  /* 4) Arka plan renkleri kesin uygulansın */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  /* 5) Görsel bütünlüğü */
  .fimg { display: block; }
  .fimg img { display: block; width: 100%; height: auto; }

  /* Görseller container'ı taşırmasın */
  .fimg img, .hero-shot img { max-width: 100%; height: auto; display: block; }

  /* Padding'i biraz azalt — PDF sayfaları çok geniş görünsün */
  .section, .hero, .stats, .cta { padding-left: 40px !important; padding-right: 40px !important; }
  .hero { padding-top: 48px !important; padding-bottom: 40px !important; }

  /* Dikey padding minimize */
  .section { padding: 36px 48px !important; }
  .stats { padding: 40px 48px !important; }
  .quote { padding: 44px 48px !important; }
  .cta { padding: 48px 48px 32px !important; }

  /* Section head margin */
  .section-head { margin-bottom: 28px !important; }

  /* Feature row */
  .frow, .frow.rev { gap: 40px !important; margin-bottom: 0 !important; }

  /* ========== GÖRSELLERİ BÜYÜT ========== */
  /* Section-inner max-width büyüdü — daha geniş kanvas */
  .section-inner { max-width: 1180px !important; }

  /* Feature row: görsel çok daha baskın */
  .frow { grid-template-columns: 0.75fr 1.6fr !important; align-items: center !important; }
  .frow.rev { grid-template-columns: 1.6fr 0.75fr !important; align-items: center !important; }

  /* Hero screenshot maksimum */
  .hero-shot { max-width: 1180px !important; }

  /* Görsel gölgesi biraz daha derin */
  .fimg { box-shadow: 0 40px 80px -25px rgba(15,23,42,0.35), 0 12px 30px -8px rgba(15,23,42,0.20) !important; }

  /* Telefon showcase — telefonlar çok daha büyük */
  .phone-real { width: 280px !important; }
  .phone-real.featured { width: 340px !important; }
  .phone-real .phone-real-inner img { width: 100% !important; height: auto !important; }

  /* Modules & tech kartları biraz daha büyük */
  .modules { grid-template-columns: repeat(3, 1fr) !important; gap: 18px !important; }
  .mod { padding: 24px !important; }
  .techgrid { gap: 14px !important; }

  /* Modules & tech grid küçük gap */
  .modules { gap: 16px !important; }
  .techgrid { gap: 12px !important; }

  /* Print için hero shot biraz küçük */
  .hero-shot { max-width: 960px !important; }

  /* CTA butonlarını görsel olarak gösterme */
  a.btn, a.nav-cta { pointer-events: none; }
` })

console.log('[pdf] PDF üretiliyor…')

await page.emulateMedia({ media: 'screen' })   // 'print' değil — screen görünümü koru

// Sayfa boyu section içeriğinin doğal yüksekliği ile eşleşecek.
// break-before: page zaten her section'ı ayırır.
await page.pdf({
  path: OUT,
  width: '1240px',
  height: '1080px',   // görsel-ağırlıklı slaytlar için tam ekran oran (16:11)
  printBackground: true,
  displayHeaderFooter: false,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: false,
  scale: 1,
})

await browser.close()
console.log('[pdf] hazır →', OUT)
