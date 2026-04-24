/**
 * TEKLİF SATIRLARI IMPORT SCRIPT (FAZ 1 — TEK TEKLİFLİ MÜŞTERİLER)
 *
 * Satış teklif hareket listesindeki ürünleri,
 * MÜŞTERİNİN TEK TEKLİFİ VARSA o teklife satır olarak ekler.
 *
 * Kullanım:
 *   node scripts/import-teklif-satirlari.mjs --dry-run
 *   node scripts/import-teklif-satirlari.mjs --commit
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

const HAREKET_EXCEL = 'C:/Users/MSI-LAPTOP/Downloads/satış teklif hareket listesi .xlsx'
const DRY = !process.argv.includes('--commit')

const temizle = (v) => String(v == null ? '' : v).trim()
const sayi = (v) => {
  const n = parseFloat(String(v || '0').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// Döviz kodu → para birimi
const dovizMap = { 'D': 'TL', 'E': 'EUR', 'L': 'USD' }

// ── 1. Hareket Excel oku ──
console.log('📂 Hareket listesi okunuyor...')
const wb = XLSX.readFile(HAREKET_EXCEL)
const hareketler = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${hareketler.length} ürün satırı\n`)

// ── 2. Müşteri + Teklifleri çek (pagination) ──
console.log('🔎 Müşteriler ve teklifler yükleniyor...')
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
const kodToMusteri = new Map(musteriler.map(m => [m.kod, m]))

const teklifler = []
off = 0
while (true) {
  const { data, error } = await supabase.from('teklifler').select('id, teklif_no, musteri_id, satirlar').range(off, off + 999)
  if (error) { console.error('❌', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  teklifler.push(...data)
  if (data.length < 1000) break
  off += 1000
}
console.log(`   → ${musteriler.length} müşteri, ${teklifler.length} teklif\n`)

// Müşteri başına teklifleri grupla
const musteriTeklifleri = new Map()
teklifler.forEach(t => {
  if (!musteriTeklifleri.has(t.musteri_id)) musteriTeklifleri.set(t.musteri_id, [])
  musteriTeklifleri.get(t.musteri_id).push(t)
})

// ── 3. Ürünleri müşteri bazında grupla ──
const musteriUrunleri = new Map()
let atlanan_kod = 0, atlanan_musteri = 0
hareketler.forEach(h => {
  const kod = temizle(h['Cari Kodu'])
  if (!kod) { atlanan_kod++; return }
  const musteri = kodToMusteri.get(kod)
  if (!musteri) { atlanan_musteri++; return }

  if (!musteriUrunleri.has(musteri.id)) musteriUrunleri.set(musteri.id, [])
  musteriUrunleri.get(musteri.id).push({
    stokKodu: temizle(h['Stok Kod']),
    stokAdi: temizle(h['Stok Adı']) || temizle(h['Stok Kod']),
    miktar: sayi(h.Miktar),
    tutar: sayi(h.Tutar),
    doviz: dovizMap[temizle(h['Döv.Kod'])] || 'TL',
  })
})

// ── 4. Tek teklifli müşterilere ürünleri ata ──
const guncellenecekTeklifler = []
let tekTeklifli = 0, cokluTeklif = 0, tekTeklifUrun = 0
for (const [musteriId, urunListesi] of musteriUrunleri.entries()) {
  const mTeklifler = musteriTeklifleri.get(musteriId) || []
  if (mTeklifler.length === 1) {
    tekTeklifli++
    tekTeklifUrun += urunListesi.length
    const teklif = mTeklifler[0]
    // Teklif satırları zaten varsa karıştırmayalım
    const mevcutSatirlar = Array.isArray(teklif.satirlar) ? teklif.satirlar : []
    if (mevcutSatirlar.length > 0) continue  // Dolu teklif, atla
    // Yeni satırları hazırla
    const yeniSatirlar = urunListesi.map((u) => ({
      id: crypto.randomUUID(),
      stokKodu: u.stokKodu,
      stokAdi: u.stokAdi,
      miktar: u.miktar,
      birim: 'Adet',
      birimFiyat: u.miktar > 0 ? u.tutar / u.miktar : u.tutar,
      iskonto: 0,
      kdv: 20,
    }))
    const araToplam = urunListesi.reduce((s, u) => s + u.tutar, 0)
    const kdvTutar = araToplam * 0.2
    const genelToplam = araToplam + kdvTutar
    guncellenecekTeklifler.push({
      teklifId: teklif.id,
      teklifNo: teklif.teklif_no,
      satirlar: yeniSatirlar,
      genelToplam,
      urunSayi: urunListesi.length,
    })
  } else if (mTeklifler.length > 1) {
    cokluTeklif++
  }
}

console.log('📊 ANALİZ')
console.log(`   ├─ Atlanan (kod yok): ${atlanan_kod}`)
console.log(`   ├─ Atlanan (müşteri yok): ${atlanan_musteri}`)
console.log(`   ├─ Tek teklifli müşteri: ${tekTeklifli}`)
console.log(`   ├─ Çoklu teklifli müşteri: ${cokluTeklif} (atlandı, Faz 2'de)`)
console.log(`   ├─ Güncellenecek teklif: ${guncellenecekTeklifler.length}`)
console.log(`   └─ Toplam eklenecek satır: ${guncellenecekTeklifler.reduce((s, t) => s + t.urunSayi, 0)}\n`)

// ── 5. İlk 5 örnek ──
console.log('👀 İLK 5 GÜNCELLENECEK TEKLİF')
guncellenecekTeklifler.slice(0, 5).forEach((g, i) => {
  console.log(`   ${i + 1}. Teklif ${g.teklifNo}`)
  console.log(`      Ürün sayısı: ${g.urunSayi}`)
  console.log(`      Genel toplam: ${g.genelToplam.toFixed(2)} ${g.satirlar[0]?.paraBirimi || 'TL'}`)
  console.log(`      İlk 3 ürün:`)
  g.satirlar.slice(0, 3).forEach(s => {
    console.log(`        - ${s.stokAdi.substring(0, 50)} × ${s.miktar} = ${s.araToplam.toFixed(2)} ${s.paraBirimi}`)
  })
  console.log('')
})

if (DRY) {
  console.log('🧪 DRY-RUN — hiçbir şey yazılmadı.')
  console.log('   Commit: node scripts/import-teklif-satirlari.mjs --commit')
  process.exit(0)
}

// ── 6. Commit ──
if (guncellenecekTeklifler.length === 0) {
  console.log('✅ Güncellenecek teklif yok.')
  process.exit(0)
}

console.log('💾 IMPORT BAŞLIYOR...')
let yazilan = 0, hatali = 0

for (const g of guncellenecekTeklifler) {
  const { error } = await supabase
    .from('teklifler')
    .update({ satirlar: g.satirlar, genel_toplam: g.genelToplam })
    .eq('id', g.teklifId)
  if (error) {
    console.error(`\n   ❌ Teklif ${g.teklifNo}:`, error.message)
    hatali++
  } else {
    yazilan++
    process.stdout.write(`\r   ⏳ ${yazilan}/${guncellenecekTeklifler.length}...`)
  }
}

console.log('\n\n✅ TAMAMLANDI')
console.log(`   ├─ Güncellenen teklif: ${yazilan}`)
console.log(`   └─ Hatalı: ${hatali}`)
