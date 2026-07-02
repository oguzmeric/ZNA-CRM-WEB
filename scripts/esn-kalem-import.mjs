// ESN Web'den çekilen teklif kalemlerini ZNA CRM'e insert eder.
// CSV: teklif_no, firma_adi, stok_kodu, stok_adi, miktar, birim, fiyat, dovkod, kur, kdv, isk1, ...
// CRM: teklifler.satirlar JSONB — {id, kdv, birim, miktar, iskonto, stokAdi, stokKodu, birimFiyat, ...}
// Eşleşme: teklifler.teklif_no = csv.teklif_no

import fs from 'fs'
import pg from 'pg'
import crypto from 'crypto'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const flags = process.argv.slice(2).filter(a => a.startsWith('--'))
const CSV_PATH = args[0] || 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\esn.csv'
const DRY_RUN = flags.includes('--dry')
const FORCE = flags.includes('--force')  // Mevcut dolu satırların üstüne yazma varsayılan olarak kapalı

// CSV parse
const raw = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '')
const lines = raw.split(/\r?\n/).filter(l => l.trim())
const headers = lines[0].split(';')
const rows = lines.slice(1).map(l => {
  const vals = []
  let cur = '', inQ = false
  for (const ch of l) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ';' && !inQ) { vals.push(cur); cur = ''; continue }
    cur += ch
  }
  vals.push(cur)
  const o = {}
  headers.forEach((h, i) => o[h] = vals[i] || '')
  return o
})

console.log('CSV satırı:', rows.length)

// Teklif no'ya göre gruplama
const gruplar = new Map()
for (const r of rows) {
  const tno = r.teklif_no
  if (!gruplar.has(tno)) gruplar.set(tno, { header: r, kalemler: [] })
  gruplar.get(tno).kalemler.push(r)
}
console.log('Benzersiz teklif:', gruplar.size)

// Döviz kodu haritalama (esnweb → CRM formatı)
const dovkodHarita = { 'L': 'TL', 'D': 'USD', 'E': 'EUR', 'S': 'GBP', 'J': 'JPY', 'C': 'CHF', 'R': 'RUB' }

// Birim normalize
const birimNorm = (b) => {
  const map = { 'ADET': 'Adet', 'METRE': 'Metre', 'KG': 'Kg', 'MT': 'Metre', 'MT.': 'Metre' }
  return map[b?.toUpperCase()] || b || 'Adet'
}

const parseSayi = (v) => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// Kalem → CRM JSONB formatı
const kalemToJson = (k) => ({
  id: crypto.randomUUID(),
  kdv: parseSayi(k.kdv) || 20,
  birim: birimNorm(k.birim),
  miktar: parseSayi(k.miktar),
  iskonto: parseSayi(k.isk1),
  stokAdi: k.stok_adi || '',
  stokKodu: k.stok_kodu || '',
  birimFiyat: parseSayi(k.fiyat),
})

// DB bağlan
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432,
  database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// CRM'de mevcut teklif no'ları çek
const csvFisnos = [...gruplar.keys()]
const crmData = await client.query(
  `SELECT teklif_no, id, firma_adi, jsonb_array_length(coalesce(satirlar,'[]'::jsonb)) as mevcut_kalem_sayisi
   FROM teklifler WHERE teklif_no = ANY($1)`,
  [csvFisnos]
)
const crmMap = new Map(crmData.rows.map(r => [r.teklif_no, r]))

console.log(`\n=== EŞLEŞTİRME ===`)
console.log(`CSV teklif: ${csvFisnos.length}, CRM'de mevcut: ${crmMap.size}`)

const eslesenler = []
const eksik = []
const doluOlanlar = []  // CRM'de zaten kalemleri olanlar — üstüne yazmayacağız (FORCE hariç)

for (const [tno, {header, kalemler}] of gruplar) {
  const crm = crmMap.get(tno)
  if (!crm) { eksik.push({tno, firma: header.firma_adi, kalemSayisi: kalemler.length}); continue }
  if (Number(crm.mevcut_kalem_sayisi) > 0 && !FORCE) {
    doluOlanlar.push({tno, mevcut: crm.mevcut_kalem_sayisi, yeni: kalemler.length})
    continue
  }
  eslesenler.push({
    id: crm.id,
    tno,
    firma_adi: crm.firma_adi,
    header,
    kalemler,
    satirlar: kalemler.map(kalemToJson)
  })
}

console.log(`\n✓ INSERT edilecek: ${eslesenler.length} teklif`)
console.log(`○ Zaten dolu (atlanıyor): ${doluOlanlar.length}`)
console.log(`✗ CRM'de yok: ${eksik.length}`)

if (eksik.length > 0) {
  console.log(`\nİlk 10 eksik:`)
  eksik.slice(0, 10).forEach(e => console.log(`  ${e.tno} - ${e.firma} (${e.kalemSayisi} kalem)`))
  fs.writeFileSync('scripts/eksik-teklifler.json', JSON.stringify(eksik, null, 2))
  console.log(`\nTüm eksikler → scripts/eksik-teklifler.json`)
}

if (doluOlanlar.length > 0) {
  console.log(`\nİlk 5 zaten dolu:`)
  doluOlanlar.slice(0, 5).forEach(e => console.log(`  ${e.tno}: CRM'de ${e.mevcut} kalem var (CSV: ${e.yeni})`))
  console.log(`  (FORCE flag ile üstüne yazabilirsin)`)
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] Insert yapılmadı.')
  console.log('\n--- Örnek insert (ilk teklif):')
  console.log(JSON.stringify(eslesenler[0], null, 2))
  await client.end()
  process.exit(0)
}

// INSERT
console.log(`\n=== UPDATE başlıyor ===`)
let ok = 0, fail = 0
for (const e of eslesenler) {
  try {
    // Toplam tutar hesapla (basit — kalem tutarları toplamı, kdv dahil)
    let genTop = 0
    let dovkod = 'TL'
    let kur = null
    if (e.kalemler.length > 0) {
      dovkod = dovkodHarita[e.kalemler[0].dovkod?.toUpperCase()] || 'TL'
      kur = parseSayi(e.kalemler[0].kur) || null
      genTop = e.kalemler.reduce((sum, k) => {
        const tutar = parseSayi(k.tutar)
        const kdvTut = tutar * parseSayi(k.kdv) / 100
        return sum + tutar + kdvTut
      }, 0)
    }
    await client.query(
      `UPDATE teklifler
       SET satirlar = $1::jsonb,
           para_birimi = $2,
           doviz_kuru = $3,
           genel_toplam = $4
       WHERE id = $5`,
      [JSON.stringify(e.satirlar), dovkod, kur, genTop.toFixed(2), e.id]
    )
    ok++
    if (ok % 50 === 0) console.log(`  ${ok}/${eslesenler.length} işlendi...`)
  } catch (err) {
    fail++
    console.error(`  ✗ ${e.tno}: ${err.message}`)
  }
}

console.log(`\n✓✓ BİTTİ. ${ok} teklif güncellendi, ${fail} hata.`)
await client.end()
