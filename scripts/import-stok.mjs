/**
 * STOK LİSTESİ IMPORT SCRIPT
 *
 * Kullanım:
 *   node scripts/import-stok.mjs --dry-run
 *   node scripts/import-stok.mjs --commit
 *
 * Excel kolonları:
 *   Stok Kod      → stok_kodu
 *   Stok Adı      → stok_adi
 *   Stok Grup     → grup_kodu (boşsa null)
 *   Birim         → birim (ADET → Adet, METRE → Metre)
 *   Üretici Kodu  → aciklama (varsa)
 *   Temin Süresi  → aciklama'ya eklenir (varsa)
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

const EXCEL = 'C:/Users/MSI-LAPTOP/Downloads/Malzeme kart listesi ( stok ).xlsx'
const DRY = !process.argv.includes('--commit')
const BATCH = 500

const temizle = (v) => String(v == null ? '' : v).trim()

const normBirim = (b) => {
  const up = temizle(b).toUpperCase()
  const map = {
    'ADET': 'Adet',
    'METRE': 'Metre',
    'KG': 'Kg',
    'BOY': 'Boy',
    'PAKET': 'Paket',
    'KUTU': 'Kutu',
    'LİTRE': 'Litre',
    'LITRE': 'Litre',
  }
  return map[up] || 'Adet'
}

// ── 1. Excel oku ──
console.log('📂 Excel okunuyor...')
const wb = XLSX.readFile(EXCEL)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır\n`)

// ── 2. Mevcut stok kodlarını çek (duplicate önleme) ──
console.log('🔎 Mevcut stok ürünleri yükleniyor...')
const mevcut = []
let off = 0
while (true) {
  const { data, error } = await supabase.from('stok_urunler').select('stok_kodu').range(off, off + 999)
  if (error) { console.error('❌', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  mevcut.push(...data)
  if (data.length < 1000) break
  off += 1000
}
const mevcutKodlar = new Set(mevcut.map(m => m.stok_kodu))
console.log(`   → ${mevcutKodlar.size} mevcut ürün\n`)

// ── 3. Temizle ve dönüştür ──
const hata = { kodBos: 0, adiBos: 0, atlanan: 0 }
const urunler = []

rows.forEach(r => {
  const stokKodu = temizle(r['Stok Kod'])
  if (!stokKodu) { hata.kodBos++; return }

  // Mevcut mu? Atla
  if (mevcutKodlar.has(stokKodu)) { hata.atlanan++; return }

  const stokAdi = temizle(r['Stok Adı']) || stokKodu  // Ad boşsa kodu kullan
  if (!temizle(r['Stok Adı'])) hata.adiBos++

  const birim = normBirim(r['Birim'])
  const grupKodu = temizle(r['Stok Grup']) || null
  const ureticiKodu = temizle(r['Üretici Kodu'])
  const temin = temizle(r['Temin Süresi'])

  const aciklamaParcalar = []
  if (ureticiKodu) aciklamaParcalar.push(`Üretici: ${ureticiKodu}`)
  if (temin && temin !== '0') aciklamaParcalar.push(`Temin: ${temin} gün`)
  const aciklama = aciklamaParcalar.join(' · ') || null

  urunler.push({
    stok_kodu: stokKodu,
    stok_adi: stokAdi,
    birim,
    grup_kodu: grupKodu,
    aciklama,
    katalogda_goster: true,
  })
})

console.log('📊 İŞLEME')
console.log(`   ├─ Eklenecek: ${urunler.length}`)
console.log(`   ├─ Mevcut (atlandı): ${hata.atlanan}`)
console.log(`   ├─ Kod boş: ${hata.kodBos}`)
console.log(`   └─ Ad boş (kod kullanıldı): ${hata.adiBos}\n`)

// ── 4. Birim dağılımı ──
const birimSayac = {}
urunler.forEach(u => { birimSayac[u.birim] = (birimSayac[u.birim] || 0) + 1 })
console.log('📏 BİRİM DAĞILIMI')
Object.entries(birimSayac).forEach(([k, v]) => console.log(`   ├─ ${k}: ${v}`))
console.log('')

// ── 5. İlk 5 örnek ──
console.log('👀 İLK 5 ÖRNEK')
urunler.slice(0, 5).forEach((u, i) => {
  console.log(`   ${i + 1}. ${u.stok_kodu}`)
  console.log(`      Ad      : ${u.stok_adi}`)
  console.log(`      Birim   : ${u.birim}`)
  console.log(`      Grup    : ${u.grup_kodu || '—'}`)
  console.log(`      Açıkl.  : ${u.aciklama || '—'}`)
  console.log('')
})

if (DRY) {
  console.log('🧪 DRY-RUN — hiçbir şey yazılmadı.')
  console.log('   Commit: node scripts/import-stok.mjs --commit')
  process.exit(0)
}

if (urunler.length === 0) {
  console.log('✅ Eklenecek ürün yok.')
  process.exit(0)
}

// ── 6. Commit ──
console.log('💾 IMPORT BAŞLIYOR...')
let yazilan = 0, hatali = 0
const hataDetay = []

for (let i = 0; i < urunler.length; i += BATCH) {
  const batch = urunler.slice(i, i + BATCH)
  const { data, error } = await supabase.from('stok_urunler').insert(batch).select('id')
  if (error) {
    console.error(`\n   ❌ Batch ${Math.floor(i / BATCH) + 1}:`, error.message)
    hatali += batch.length
    hataDetay.push({ batch: i, mesaj: error.message, ornek: batch[0] })
  } else {
    yazilan += data?.length || 0
    process.stdout.write(`\r   ⏳ ${yazilan}/${urunler.length}...`)
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
