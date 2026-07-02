// CRM'de olmayan esnweb tekliflerini YENİ teklif olarak oluşturur.
// Header: Excel'den (bb.xlsx) — firma_adi, tarih, kabul, temsilci, açıklama
// Kalemler: CSV'den (esn4.csv) — stok, miktar, fiyat, kdv, isk

import fs from 'fs'
import pg from 'pg'
import crypto from 'crypto'
import XLSX from 'xlsx'

const CSV = 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\esn4.csv'
const XLSX_PATH = 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\bb.xlsx'
const DRY = process.argv.includes('--dry')

// Excel oku — header verisi
const wb = XLSX.readFile(XLSX_PATH)
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
const excelMap = new Map()
for (const r of excelRows) {
  const tno = String(r['Teklif No']).trim()
  if (tno) excelMap.set(tno, r)
}
console.log('Excel teklif:', excelMap.size)

// CSV oku — kalemler
const raw = fs.readFileSync(CSV, 'utf-8').replace(/^﻿/, '')
const lines = raw.split(/\r?\n/).filter(l => l.trim())
const headers = lines[0].split(';')
const csvRows = lines.slice(1).map(l => {
  const vals = []; let cur = '', inQ = false
  for (const ch of l) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ';' && !inQ) { vals.push(cur); cur = ''; continue }
    cur += ch
  }
  vals.push(cur)
  const o = {}; headers.forEach((h, i) => o[h] = vals[i] || '')
  return o
})

const csvMap = new Map()
for (const r of csvRows) {
  const tno = r.teklif_no
  if (!csvMap.has(tno)) csvMap.set(tno, [])
  csvMap.get(tno).push(r)
}
console.log('CSV teklif (kalemli):', csvMap.size)

// Helpers
const parseSayi = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }
const dovkodHarita = { 'L': 'TL', 'D': 'USD', 'E': 'EUR', 'S': 'GBP' }
const birimNorm = b => ({ 'ADET': 'Adet', 'METRE': 'Metre', 'KG': 'Kg' })[b?.toUpperCase()] || b || 'Adet'

const parseTarih = t => {
  if (!t) return null
  const s = String(t).split(' ')[0]  // "12.06.2026 00:00:00" → "12.06.2026"
  const m = s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/)
  if (!m) return null
  let [, d, mn, y] = m
  if (y.length === 2) y = '20' + y
  const iso = `${y}-${mn.padStart(2, '0')}-${d.padStart(2, '0')}`
  if (iso === '1899-12-30') return null
  return iso
}

const kalemToJson = k => ({
  id: crypto.randomUUID(),
  kdv: parseSayi(k.kdv) || 20,
  birim: birimNorm(k.birim),
  miktar: parseSayi(k.miktar),
  iskonto: parseSayi(k.isk1),
  stokAdi: k.stok_adi || '',
  stokKodu: k.stok_kodu || '',
  birimFiyat: parseSayi(k.fiyat),
})

// DB
const c = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// CRM'de zaten olan teklif_no'ları çek — bunlara yeni eklemeyeceğiz
const mevcutQ = await c.query(`SELECT teklif_no FROM teklifler WHERE teklif_no = ANY($1)`, [[...csvMap.keys()]])
const mevcutSet = new Set(mevcutQ.rows.map(r => r.teklif_no))

// Ekleyeceklerimiz: CSV'de var, CRM'de yok
const eklenecek = []
for (const [tno, kalemler] of csvMap) {
  if (mevcutSet.has(tno)) continue
  const excelRow = excelMap.get(tno)
  if (!excelRow) continue  // Excel'de yoksa header bilgisi eksik, atla

  const firmaAdi = String(excelRow['Ünvanı'] || kalemler[0].firma_adi || '').trim()
  const tarih = parseTarih(excelRow['Tarih'])
  const kabul = String(excelRow['Kabul'] || 'H').toUpperCase()
  const kabulTarihi = parseTarih(excelRow['Kabul Tarihi'])
  const teslimTarihi = parseTarih(excelRow['Teslim Tarihi'])
  const temsilci = String(excelRow['M.Temsilcisi'] || kalemler[0].temsilci || '').trim()
  const aciklama = String(excelRow['Açıklama'] || '').trim()

  const dovkod = dovkodHarita[kalemler[0].dovkod?.toUpperCase()] || 'TL'
  const kur = parseSayi(kalemler[0].kur) || null
  const satirlar = kalemler.map(kalemToJson)
  const genelToplam = satirlar.reduce((s, x) => {
    const tut = x.miktar * x.birimFiyat * (1 - x.iskonto / 100)
    return s + tut * (1 + x.kdv / 100)
  }, 0)

  eklenecek.push({
    teklif_no: tno,
    firma_adi: firmaAdi,
    tarih,
    kabul_tarihi: kabul === 'E' ? kabulTarihi : null,
    teslim_tarihi: teslimTarihi,
    onay_durumu: kabul === 'E' ? 'kabul' : 'bekliyor',
    musteri_temsilcisi: temsilci,
    aciklama,
    para_birimi: dovkod,
    doviz_kuru: kur,
    satirlar,
    genel_toplam: Number(genelToplam.toFixed(2)),
  })
}

console.log(`\n=== ÖZET ===`)
console.log(`CSV'de olup CRM'de olmayan: ${eklenecek.length}`)
console.log(`CSV'de olup Excel'de olmayan: ${[...csvMap.keys()].filter(t => !mevcutSet.has(t) && !excelMap.has(t)).length}`)

if (DRY) {
  console.log('\n--- Örnek eklenecek:')
  console.log(JSON.stringify(eklenecek[0], null, 2))
  await c.end()
  process.exit(0)
}

console.log('\n=== INSERT başlıyor ===')
let ok = 0, fail = 0
for (const e of eklenecek) {
  try {
    await c.query(
      `INSERT INTO teklifler (
        teklif_no, firma_adi, tarih, kabul_tarihi, teslim_tarihi,
        onay_durumu, musteri_temsilcisi, aciklama,
        para_birimi, doviz_kuru, satirlar, genel_toplam, revizyon, teklif_tipi
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,0,'standart')`,
      [
        e.teklif_no, e.firma_adi, e.tarih, e.kabul_tarihi, e.teslim_tarihi,
        e.onay_durumu, e.musteri_temsilcisi, e.aciklama,
        e.para_birimi, e.doviz_kuru, JSON.stringify(e.satirlar), e.genel_toplam,
      ]
    )
    ok++
    if (ok % 50 === 0) console.log(`  ${ok}/${eklenecek.length}...`)
  } catch (err) {
    fail++
    console.error(`  ✗ ${e.teklif_no}: ${err.message}`)
    if (fail > 5) { console.error('Çok hata, dur'); break }
  }
}
console.log(`\n✓✓ ${ok} yeni teklif oluşturuldu, ${fail} hata.`)
await c.end()
