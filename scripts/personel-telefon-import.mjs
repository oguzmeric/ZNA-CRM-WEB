// Excel'deki personel telefon numaralarını kullanicilar.cep_telefon'a yaz.
// Fuzzy match: Excel Ad Soyad ↔ CRM kullanicilar.ad
//
// Format: normalize edip 5xxxxxxxxx (10 haneli) tut. SMS edge function kabul eder.

import pg from 'pg'
import XLSX from 'xlsx'

const XLSX_PATH = 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\pers.xlsx'
const DRY = process.argv.includes('--dry')

const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

const normTel = (s) => {
  if (!s) return null
  const clean = String(s).replace(/[^\d+]/g, '')
  let num = clean.startsWith('+90') ? clean.slice(3) : clean
  if (num.startsWith('0090')) num = num.slice(4)
  if (num.length === 12 && num.startsWith('90')) num = num.slice(2)
  if (num.length === 11 && num.startsWith('0')) num = num.slice(1)
  return /^5\d{9}$/.test(num) ? num : null
}

// İsim normalize (büyük harf, Türkçe karakter, boşluk)
const normAd = (s) => (s || '').toString().toLocaleUpperCase('tr-TR')
  .replace(/İ/g, 'I').replace(/Ğ/g, 'G').replace(/Ş/g, 'S')
  .replace(/Ç/g, 'C').replace(/Ö/g, 'O').replace(/Ü/g, 'U')
  .replace(/\s+/g, ' ').trim()

const c = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD, ssl: { rejectUnauthorized: false },
})
await c.connect()

const znaQ = await c.query(`SELECT id, ad, kullanici_adi, cep_telefon FROM kullanicilar WHERE tip='zna' AND hesap_silindi = false ORDER BY ad`)
console.log(`CRM'de aktif ZNA personel: ${znaQ.rows.length}\n`)

const eslesme = []
const eslesmeyen = []

for (const r of rows) {
  const excelAd = r['Ad Soyad'] || r['Pers.Kodu']
  const tel = normTel(r['Cep.Tel']) || normTel(r['Telefon'])
  if (!tel) {
    eslesmeyen.push({ excelAd, sebep: 'tel yok' })
    continue
  }
  const excelNorm = normAd(excelAd)

  // Best match: excel adı ile CRM ad + kullanici_adi'nda kelime kesişimi
  let bestK = null, bestScore = 0
  const excelKel = new Set(excelNorm.split(' ').filter(w => w.length >= 3))
  for (const k of znaQ.rows) {
    const crmNorm = normAd(k.ad)
    if (crmNorm === excelNorm) { bestK = k; bestScore = 10; break }
    // Kelime bazlı intersection (ad + kullanici_adi)
    const kAdi = normAd(k.kullanici_adi || '').replace(/[._@].*$/,'').replace(/\d/g,'')
    const crmKel = new Set([...crmNorm.split(' '), ...kAdi.split('.'), kAdi].filter(w => w.length >= 3))
    let ortak = 0
    for (const w of excelKel) if (crmKel.has(w)) ortak++
    // özel eşleşme: kullanici_adi soyisim benzeri (agun -> AGUN)
    for (const w of excelKel) {
      if (kAdi.includes(w) || w.includes(kAdi.replace('.',''))) ortak += 0.5
    }
    if (ortak > bestScore) { bestScore = ortak; bestK = k }
  }
  if (bestK && bestScore >= 1) {
    eslesme.push({ excelAd, crmAd: bestK.ad, crmId: bestK.id, tel, mevcutTel: bestK.cep_telefon })
  } else {
    eslesmeyen.push({ excelAd, tel, sebep: `CRM'de bulunamadı (en yakın: ${bestK?.ad || 'yok'}, skor: ${bestScore})` })
  }
}

console.log(`✓ Eşleşen: ${eslesme.length}`)
eslesme.forEach(e => {
  const durum = e.mevcutTel ? (e.mevcutTel === e.tel ? '=' : '↻') : '+'
  console.log(`  ${durum} ${e.excelAd.padEnd(28)} → ${e.crmAd.padEnd(28)} | ${e.tel}${e.mevcutTel && e.mevcutTel !== e.tel ? ` (eski: ${e.mevcutTel})` : ''}`)
})

console.log(`\n✗ Eşleşmeyen: ${eslesmeyen.length}`)
eslesmeyen.forEach(e => console.log(`  · ${e.excelAd}: ${e.sebep}`))

if (DRY) { console.log('\n[DRY RUN]'); await c.end(); process.exit(0) }

console.log('\n=== UPDATE ===')
let ok = 0
for (const e of eslesme) {
  if (e.mevcutTel === e.tel) continue  // aynı ise atla
  await c.query(`UPDATE kullanicilar SET cep_telefon = $1 WHERE id = $2`, [e.tel, e.crmId])
  ok++
}
console.log(`✓ ${ok} kullanıcının telefonu güncellendi.`)
await c.end()
