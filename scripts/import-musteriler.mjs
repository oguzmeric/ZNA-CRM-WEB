/**
 * MÜŞTERİ LİSTESİ IMPORT SCRIPT
 *
 * Kullanım:
 *   node scripts/import-musteriler.mjs --dry-run   # önce dene (yazmadan)
 *   node scripts/import-musteriler.mjs --commit    # gerçek import
 *
 * Beklenen Excel kolonları: Kodu, Firma, Adres, Şehir, İlçe, Telefon, Cep Tel., E-Mail
 */
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// .env dosyasını oku
const envPath = path.join(__dirname, '..', '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY olmalı')
  process.exit(1)
}

const EXCEL_YOLU = 'C:/Users/MSI-LAPTOP/Downloads/Müşteri listesi.xlsx'
const DRY_RUN = !process.argv.includes('--commit')
const BATCH_BOYUT = 100

// ── 1. Excel'i oku ──────────────────────────────────────────────
console.log('📂 Excel okunuyor:', EXCEL_YOLU)
const wb = XLSX.readFile(EXCEL_YOLU)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır okundu`)

// ── 2. Temizle ve dönüştür ──────────────────────────────────────
const temizle = (v) => String(v || '').trim()

const musteriler = rows
  .filter(r => temizle(r.Firma) && temizle(r.Kodu)) // firma ve kod dolu olmalı
  .map(r => {
    const sehir = temizle(r['Şehir'])
    const ilce = temizle(r['İlçe'])
    const sehirBirlesik = [sehir, ilce].filter(Boolean).join(' · ') || null

    const telefon = temizle(r['Cep Tel.']) || temizle(r['Telefon']) || ''
    const email = temizle(r['E-Mail']) || ''
    const adres = temizle(r['Adres']).replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim()

    // Notlar: adres varsa buraya
    const notlarParcalar = []
    if (adres) notlarParcalar.push(`📍 Adres: ${adres}`)
    const notlar = notlarParcalar.join('\n')

    return {
      kod: temizle(r.Kodu),
      firma: temizle(r.Firma),
      ad: '',
      soyad: '',
      unvan: '',
      telefon,
      email,
      sehir: sehirBirlesik || '',
      vergi_no: '',
      notlar,
      durum: 'aktif',
      olusturma_tarih: new Date().toISOString(),
    }
  })

console.log(`   → ${musteriler.length} geçerli kayıt`)
console.log(`   → ${rows.length - musteriler.length} satır atlandı (firma/kod boş)\n`)

// ── 3. Özet ─────────────────────────────────────────────────────
const telefonlu = musteriler.filter(m => m.telefon).length
const emailli = musteriler.filter(m => m.email).length
const sehirli = musteriler.filter(m => m.sehir).length
const adresli = musteriler.filter(m => m.notlar).length

console.log('📊 İÇERİK ÖZETİ')
console.log(`   ├─ Telefon dolu: ${telefonlu}`)
console.log(`   ├─ E-posta dolu: ${emailli}`)
console.log(`   ├─ Şehir dolu:   ${sehirli}`)
console.log(`   └─ Notlar dolu:  ${adresli}\n`)

// ── 4. Mevcut kodları kontrol et ───────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

console.log('🔎 Supabase\'te mevcut müşteriler kontrol ediliyor...')
const { data: mevcut, error: selectErr } = await supabase
  .from('musteriler')
  .select('kod')

if (selectErr) {
  console.error('❌ Mevcut kayıtlar okunamadı:', selectErr.message)
  process.exit(1)
}

const mevcutKodlar = new Set((mevcut || []).map(m => m.kod))
console.log(`   → Mevcut ${mevcutKodlar.size} kod bulundu`)

const yeniler = musteriler.filter(m => !mevcutKodlar.has(m.kod))
const atlananlar = musteriler.length - yeniler.length
console.log(`   → ${yeniler.length} yeni kayıt eklenecek`)
if (atlananlar > 0) {
  console.log(`   → ${atlananlar} kayıt atlanacak (kod zaten var)`)
}
console.log('')

if (yeniler.length === 0) {
  console.log('✅ Eklenecek yeni kayıt yok. Çıkılıyor.')
  process.exit(0)
}

// ── 5. İlk 3 örnek göster ──────────────────────────────────────
console.log('👀 İLK 3 ÖRNEK KAYIT')
yeniler.slice(0, 3).forEach((m, i) => {
  console.log(`   ${i + 1}.`)
  console.log(`      Kod    : ${m.kod}`)
  console.log(`      Firma  : ${m.firma}`)
  console.log(`      Telefon: ${m.telefon || '—'}`)
  console.log(`      Email  : ${m.email || '—'}`)
  console.log(`      Şehir  : ${m.sehir || '—'}`)
  console.log(`      Notlar : ${m.notlar ? m.notlar.substring(0, 80) + '...' : '—'}`)
  console.log('')
})

// ── 6. Dry-run veya gerçek import ──────────────────────────────
if (DRY_RUN) {
  console.log('🧪 DRY-RUN MODU — hiçbir şey yazılmadı.')
  console.log('   Gerçek import için: node scripts/import-musteriler.mjs --commit')
  process.exit(0)
}

console.log('💾 GERÇEK IMPORT BAŞLIYOR...')
console.log(`   → ${yeniler.length} kayıt ${BATCH_BOYUT}'lük gruplar halinde yazılacak\n`)

let yazilanToplam = 0
let hataliToplam = 0
const hatalar = []

for (let i = 0; i < yeniler.length; i += BATCH_BOYUT) {
  const batch = yeniler.slice(i, i + BATCH_BOYUT)
  const { data, error } = await supabase.from('musteriler').insert(batch).select('id')

  if (error) {
    console.error(`   ❌ Batch ${Math.floor(i / BATCH_BOYUT) + 1} hatası:`, error.message)
    hataliToplam += batch.length
    hatalar.push({ batch: i, hata: error.message, ornek: batch[0] })
  } else {
    yazilanToplam += data?.length || 0
    process.stdout.write(`\r   ⏳ ${yazilanToplam}/${yeniler.length} yazıldı...`)
  }
}

console.log('\n\n✅ IMPORT TAMAMLANDI')
console.log(`   ├─ Yazılan: ${yazilanToplam}`)
console.log(`   └─ Hatalı:  ${hataliToplam}`)

if (hatalar.length > 0) {
  console.log('\n⚠️ HATALAR:')
  hatalar.forEach(h => {
    console.log(`   Batch ${h.batch}: ${h.hata}`)
    console.log(`   Örnek kayıt:`, JSON.stringify(h.ornek, null, 2).substring(0, 200))
  })
}
