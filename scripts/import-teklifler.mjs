/**
 * TEKLİF LİSTESİ IMPORT SCRIPT
 *
 * Kullanım:
 *   node scripts/import-teklifler.mjs --dry-run
 *   node scripts/import-teklifler.mjs --commit
 *
 * Excel kolonları:
 *   Kodu         → müşteri eşleme (musteri_id, firma_adi)
 *   Tarih        → tarih
 *   Teklif No    → teklif_no (olduğu gibi - boşsa otomatik IMP-YYYY-NNNN)
 *   Kabul E/H    → onay_durumu (kabul/red)
 *   Kabul Tarihi → kabul_tarihi (30.12.1899 null sayılır)
 *   Kabul Eden   → kabul_eden
 *   M.Temsilcisi → musteri_temsilcisi
 *   Teslim Yeri  → teslim_yeri (notlara eklenecek)
 *   Teslim Tarihi→ teslim_tarihi
 *   Ödeme Şekli  → odeme_sekli
 *   Açıklama     → notlar
 */
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=').map(s => s.trim())))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const EXCEL = 'C:/Users/MSI-LAPTOP/Downloads/Teklif Listesi.xlsx'
const DRY = !process.argv.includes('--commit')
const BATCH = 200

// Tarih parse: "27.10.2022 00:00:00" → "2022-10-27"
// 30.12.1899 = Excel "boş tarih", null döndür
const parseTarih = (s) => {
  if (s == null || s === '') return null
  if (typeof s === 'number') {
    const d = XLSX.SSF.parse_date_code(s)
    if (!d) return null
    if (d.y === 1899 && d.m === 12 && d.d === 30) return null // Excel null date
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, g, a, y] = m
  if (y === '1899') return null
  return `${y}-${a.padStart(2, '0')}-${g.padStart(2, '0')}`
}

const temizle = (v) => String(v == null ? '' : v).trim()

// ── 1. Excel oku ──
console.log('📂 Excel okunuyor...')
const wb = XLSX.readFile(EXCEL)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır\n`)

// ── 2. Müşterileri yükle (pagination) ──
console.log('🔎 Müşteriler yükleniyor...')
const musteriler = []
let off = 0
while (true) {
  const { data, error } = await supabase.from('musteriler').select('id, kod, firma').range(off, off + 999)
  if (error) { console.error('❌', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  musteriler.push(...data)
  if (data.length < 1000) break
  off += 1000
}
const kodMap = new Map()
musteriler.forEach(m => kodMap.set(m.kod, m))
console.log(`   → ${kodMap.size} müşteri\n`)

// ── 3. Temizle ve dönüştür ──
const hata = { kodBos: 0, mBulunamadi: 0, tarihYok: 0 }
const teklifler = []
let otomatikNo = 1
const nonceMap = new Map() // duplicate teklif_no'ları ayırt etmek için

rows.forEach((r) => {
  const kod = temizle(r.Kodu)
  if (!kod) { hata.kodBos++; return }

  const musteri = kodMap.get(kod)
  if (!musteri) { hata.mBulunamadi++; return }

  const tarih = parseTarih(r.Tarih)
  if (!tarih) { hata.tarihYok++; return }

  // Teklif no (değiştirilmeyecek, boşsa otomatik)
  let teklifNo = temizle(r['Teklif No'])
  if (!teklifNo) {
    const yil = tarih.substring(0, 4)
    teklifNo = `IMP-${yil}-${String(otomatikNo).padStart(4, '0')}`
    otomatikNo++
  }

  // Duplicate teklif_no varsa: suffix ekle (ZNA - 31.10.22 (2), ZNA - 31.10.22 (3))
  const sayac = nonceMap.get(teklifNo) || 0
  nonceMap.set(teklifNo, sayac + 1)
  if (sayac > 0) teklifNo = `${teklifNo} (${sayac + 1})`

  // Kabul: E → 'kabul', H → 'vazgecildi' (reddedildi), diğer → 'takipte'
  const kabul = temizle(r.Kabul).toUpperCase()
  const onayDurumu = kabul === 'E' ? 'kabul' : kabul === 'H' ? 'vazgecildi' : 'takipte'

  // Satış temsilcisi (farklı case'leri normalize et)
  let temsilci = temizle(r['M.Temsilcisi'])
  if (temsilci.toUpperCase() === 'TARIK ALTAŞ') temsilci = 'TARIK ALTAŞ'

  // Notlara Teslim Yeri ve Açıklama birleştir
  const notlarParcalar = []
  const aciklama = temizle(r['Açıklama']).replace(/\r\n/g, '\n').trim()
  const teslimYeri = temizle(r['Teslim Yeri'])
  const ozelKod = temizle(r['Özel Kod'])
  if (aciklama) notlarParcalar.push(aciklama)
  if (teslimYeri) notlarParcalar.push(`📍 Teslim Yeri: ${teslimYeri}`)
  if (ozelKod) notlarParcalar.push(`🏷️ Özel Kod: ${ozelKod}`)
  const notlar = notlarParcalar.join('\n')

  teklifler.push({
    teklif_no: teklifNo,
    musteri_id: musteri.id,
    firma_adi: musteri.firma,
    konu: null,
    tarih,
    onay_durumu: onayDurumu,
    para_birimi: 'TL',
    aciklama: notlar,
    satirlar: [],
    genel_toplam: 0,
    genel_iskonto: 0,
    musteri_temsilcisi: temsilci || null,
    kabul_tarihi: parseTarih(r['Kabul Tarihi']),
    kabul_eden: temizle(r['Kabul Eden']) || null,
    teslim_tarihi: parseTarih(r['Teslim Tarihi']),
    odeme_sekli: temizle(r['Ödeme Şekli']) || null,
    olusturma_tarih: new Date(tarih).toISOString(),
  })
})

console.log('📊 İŞLEME')
console.log(`   ├─ Geçerli: ${teklifler.length}`)
console.log(`   ├─ Kod boş: ${hata.kodBos}`)
console.log(`   ├─ Müşteri bulunamadı: ${hata.mBulunamadi}`)
console.log(`   └─ Tarih yok: ${hata.tarihYok}\n`)

// ── 4. Dağılımlar ──
const kabulSayac = {}
teklifler.forEach(t => { kabulSayac[t.onay_durumu] = (kabulSayac[t.onay_durumu] || 0) + 1 })
console.log('✅ ONAY DURUMU')
Object.entries(kabulSayac).forEach(([k, v]) => console.log(`   ├─ ${k}: ${v}`))

const tempSayac = {}
teklifler.forEach(t => { const k = t.musteri_temsilcisi || '(yok)'; tempSayac[k] = (tempSayac[k] || 0) + 1 })
console.log('\n👤 TEMSİLCİLER')
Object.entries(tempSayac).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ├─ ${k}: ${v}`))

const odemeSayac = {}
teklifler.forEach(t => { if (t.odeme_sekli) odemeSayac[t.odeme_sekli] = (odemeSayac[t.odeme_sekli] || 0) + 1 })
console.log('\n💳 ÖDEME ŞEKLİ')
Object.entries(odemeSayac).forEach(([k, v]) => console.log(`   ├─ ${k}: ${v}`))
console.log('')

// ── 5. İlk 3 örnek ──
console.log('👀 İLK 3 ÖRNEK')
teklifler.slice(0, 3).forEach((t, i) => {
  console.log(`   ${i + 1}. ${t.firma_adi}`)
  console.log(`      Teklif No : ${t.teklif_no}`)
  console.log(`      Tarih     : ${t.tarih}`)
  console.log(`      Onay      : ${t.onay_durumu}`)
  console.log(`      Temsilci  : ${t.musteri_temsilcisi || '—'}`)
  console.log(`      Ödeme     : ${t.odeme_sekli || '—'}`)
  console.log(`      Notlar    : ${(t.notlar || '').substring(0, 80)}`)
  console.log('')
})

if (DRY) {
  console.log('🧪 DRY-RUN — hiçbir şey yazılmadı.')
  console.log('   Commit: node scripts/import-teklifler.mjs --commit')
  process.exit(0)
}

// ── 6. Commit ──
console.log('💾 IMPORT BAŞLIYOR...')
let yazilan = 0, hatali = 0
const hataDetay = []

for (let i = 0; i < teklifler.length; i += BATCH) {
  const batch = teklifler.slice(i, i + BATCH)
  const { data, error } = await supabase.from('teklifler').insert(batch).select('id')
  if (error) {
    console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1}:`, error.message)
    hatali += batch.length
    hataDetay.push({ batch: i, mesaj: error.message, ornek: batch[0] })
  } else {
    yazilan += data?.length || 0
    process.stdout.write(`\r   ⏳ ${yazilan}/${teklifler.length}...`)
  }
}

console.log('\n\n✅ TAMAMLANDI')
console.log(`   ├─ Yazılan: ${yazilan}`)
console.log(`   └─ Hatalı:  ${hatali}`)

if (hataDetay.length > 0) {
  console.log('\n⚠️ HATA DETAYI')
  hataDetay.forEach(h => {
    console.log(`   Batch ${h.batch}: ${h.mesaj}`)
    console.log(`   Örnek:`, JSON.stringify(h.ornek).substring(0, 200))
  })
}
