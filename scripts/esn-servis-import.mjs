// esnweb servis listesi → ZNA CRM servis_raporlari
// Excel kolonları → DB kolonları:
//  Takip Kodu → takip_kodu
//  Fiş.No → fis_no
//  Firma / Müşteri Adı → firma_adi
//  Sonuç → sonuc
//  Arıza Kodu → ariza_kodu
//  Teknisyen → teknisyen
//  C.H.Kodu → cari_kodu
//  Lokasyon → lokasyon
//  Sis.No → sistem_no
//  Bildiren → bildiren
//  Bil.Tarih → bil_tarih
//  Bildirilen Arıza → bildirilen_ariza
//  Gid.Tarih → gid_tarih

import fs from 'fs'
import pg from 'pg'
import XLSX from 'xlsx'

const XLSX_PATH = 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\servis.xlsx'
const DRY = process.argv.includes('--dry')

const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
console.log('Excel satırı:', rows.length)

const parseTarih = t => {
  if (!t) return null
  const s = String(t).split(' ')[0]
  const m = s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/)
  if (!m) return null
  let [, d, mn, y] = m
  if (y.length === 2) y = '20' + y
  const iso = `${y}-${mn.padStart(2, '0')}-${d.padStart(2, '0')}`
  if (iso === '1899-12-30') return null
  return iso
}

const c = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Mevcut fis_no'ları çek
const mevcutQ = await c.query('SELECT fis_no FROM servis_raporlari')
const mevcutSet = new Set(mevcutQ.rows.map(r => String(r.fis_no)))
console.log(`CRM'de mevcut fis_no: ${mevcutSet.size}`)

// Yeni olanları hazırla
const yeni = []
const excelFisnos = new Set()
for (const r of rows) {
  const fisno = String(r['Fiş.No'] || '').trim()
  if (!fisno) continue
  if (excelFisnos.has(fisno)) continue  // Excel içinde de dedup
  excelFisnos.add(fisno)
  if (mevcutSet.has(fisno)) continue

  yeni.push({
    fis_no: fisno,
    takip_kodu: String(r['Takip Kodu'] || '').trim() || null,
    firma_adi: String(r['Firma / Müşteri Adı'] || '').trim() || null,
    sonuc: String(r['Sonuç'] || '').trim() || null,
    ariza_kodu: String(r['Arıza Kodu'] || '').trim() || null,
    teknisyen: String(r['Teknisyen'] || '').trim() || null,
    cari_kodu: String(r['C.H.Kodu'] || '').trim() || null,
    lokasyon: String(r['Lokasyon'] || '').trim() || null,
    sistem_no: String(r['Sis.No'] || '').trim() || null,
    bildiren: String(r['Bildiren'] || '').trim() || null,
    bildirilen_ariza: String(r['Bildirilen Arıza'] || '').trim() || null,
    bil_tarih: parseTarih(r['Bil.Tarih']),
    gid_tarih: parseTarih(r['Gid.Tarih']),
  })
}

console.log(`\nExcel benzersiz fis_no: ${excelFisnos.size}`)
console.log(`Yeni eklenecek: ${yeni.length}`)

if (yeni.length && DRY) {
  console.log('\n--- İlk 3 örnek:')
  yeni.slice(0, 3).forEach(y => console.log(JSON.stringify(y, null, 2)))
  await c.end()
  process.exit(0)
}

if (!yeni.length) {
  console.log('Yeni servis raporu yok, çıkıldı.')
  await c.end()
  process.exit(0)
}

console.log('\n=== INSERT başlıyor ===')
let ok = 0, fail = 0
for (const s of yeni) {
  try {
    await c.query(
      `INSERT INTO servis_raporlari (
        fis_no, takip_kodu, firma_adi, sonuc, ariza_kodu, teknisyen,
        cari_kodu, lokasyon, sistem_no, bildiren, bildirilen_ariza, bil_tarih, gid_tarih
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [s.fis_no, s.takip_kodu, s.firma_adi, s.sonuc, s.ariza_kodu, s.teknisyen,
       s.cari_kodu, s.lokasyon, s.sistem_no, s.bildiren, s.bildirilen_ariza, s.bil_tarih, s.gid_tarih]
    )
    ok++
    if (ok % 50 === 0) console.log(`  ${ok}/${yeni.length}...`)
  } catch (err) {
    fail++
    console.error(`  ✗ ${s.fis_no}: ${err.message}`)
    if (fail > 5) { console.error('Çok hata, dur'); break }
  }
}
console.log(`\n✓✓ ${ok} yeni servis raporu eklendi, ${fail} hata.`)
await c.end()
