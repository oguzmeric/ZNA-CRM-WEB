// Sunucu-taraf servis formu PDF uretimi + arsivleme.
// GET /api/servis-formu-pdf?id=<talepId>
// Headless Chromium ile form HTML'ini gercek (vektorel) PDF'e basar,
// servis-formlari bucket'ina yukler, servis_formu_arsivi'ne kayit atar.
//
// Gerekli Vercel env: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
import { servisFormuHtml } from './_servisFormuHtml.mjs'

const LOGO_URL = 'https://talep.znateknoloji.com/logo.jpeg'
const BUCKET = 'servis-formlari'

// snake_case -> camelCase (ust seviye anahtarlar; jsonb ic objeler oldugu gibi kalir)
const toCamel = (row) => {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const k of Object.keys(row)) {
    const ck = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
    out[ck] = row[k]
  }
  return out
}

export default async function handler(req, res) {
  const id = Number(req.query?.id ?? 0)
  if (!id) return res.status(400).json({ ok: false, hata: 'Gecersiz id.' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok: false, hata: 'Sunucu yapilandirmasi eksik (SUPABASE_SERVICE_ROLE_KEY).' })
  }
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

  let browser
  try {
    // 1. Talep + malzemeler
    const { data: talepRow, error: talepErr } = await supa
      .from('servis_talepleri').select('*').eq('id', id).single()
    if (talepErr || !talepRow) return res.status(404).json({ ok: false, hata: 'Talep bulunamadi.' })
    const talep = toCamel(talepRow)

    const { data: malzRows } = await supa
      .from('servis_malzeme_plani').select('*').eq('servis_talep_id', id)
    const malzemeler = (malzRows ?? []).map(toCamel).filter((m) => {
      const t = Number(m.teslimAlinanMiktar ?? 0); const k = Number(m.kullanilanMiktar ?? 0)
      return t > 0 || k > 0
    })

    const fotograflar = (talep.dosyalar ?? []).filter(
      (d) => d?.tip === 'image' || /\.(jpe?g|png|webp)(\?|$)/i.test(d?.url ?? '')
    )

    // 2. HTML -> PDF (chromium)
    const html = servisFormuHtml({ talep, malzemeler, logoUrl: LOGO_URL, fotograflar })

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    await browser.close()
    browser = null

    // 3. Yukle + arsivle
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dosyaYolu = `servis_${id}/${ts}.pdf`
    const { error: upErr } = await supa.storage.from(BUCKET)
      .upload(dosyaYolu, pdf, { contentType: 'application/pdf', upsert: false })
    if (upErr) return res.status(500).json({ ok: false, hata: 'PDF yuklenemedi: ' + upErr.message })

    await supa.from('servis_formu_arsivi').insert({
      servis_id: id, dosya_yolu: dosyaYolu, olusturan_id: null, boyut_byte: pdf.length,
    })

    return res.status(200).json({ ok: true, dosyaYolu })
  } catch (e) {
    if (browser) { try { await browser.close() } catch {} }
    console.error('[servis-formu-pdf]', e)
    return res.status(500).json({ ok: false, hata: e?.message ?? 'PDF uretilemedi.' })
  }
}
