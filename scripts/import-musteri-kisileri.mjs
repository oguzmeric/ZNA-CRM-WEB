/**
 * MÜŞTERİ İLGİLİ KİŞİLERİ — GÖRÜŞME AÇIKLAMALARINDAN ÇIKARMA
 *
 * Görüşme Excel'inin "Açıklama" kolonunda "X bey / Y hanım" formatı yakalar,
 * musteri_kisiler tablosuna ekler.
 *
 * Kullanım:
 *   node scripts/import-musteri-kisileri.mjs --dry-run
 *   node scripts/import-musteri-kisileri.mjs --commit
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

const EXCEL = 'C:/Users/MSI-LAPTOP/Downloads/Görüşme listesi.xlsx'
const DRY = !process.argv.includes('--commit')

// Regex: Büyük harfle başlayan isim (Türkçe dahil) + "bey/hanım/beyefendi/hanımefendi"
// Case-sensitive — küçük harfle başlayan "tarihinde", "lerini" gibi parçaları yakalamasın
// Türkçe büyük harfler açıkça listelendi (word boundary \b Türkçe karakterleri bilmiyor)
const BUYUK = 'A-ZÇĞİÖŞÜ'
const KUCUK = 'a-zçğıöşü'
const beyRegex = new RegExp(
  `(?:^|[^${BUYUK}${KUCUK}])([${BUYUK}][${KUCUK}]{2,}(?:\\s+[${BUYUK}][${KUCUK}]{2,})?)\\s+(bey|hanım|Bey|Hanım|BEY|HANIM)(?![${BUYUK}${KUCUK}])`,
  'g'
)

// Yanlış yakalanacak "isim" olmayan kelimeler (küçük harfle karşılaştırılır)
const KARA_LISTE = new Set([
  // Selamlaşma
  'merhabalar', 'merhaba', 'selamlar', 'selam', 'iyi', 'kolay', 'hayırlı', 'günaydın',
  // Typo / yanlış
  'kontorl',
  // Bağlaçlar/zamirler
  'için', 'sonra', 'daha', 'önce', 've', 'ile', 'bu', 'şu',
  // Fiil/Sıfat kökleri (isim gibi duran ama isim olmayan)
  'verecek', 'gelen', 'giden', 'olan', 'ulaşan', 'iletti', 'atanan',
  'hazırlanıp', 'hazırlayan', 'tarihinde', 'görüştüğümüz', 'hazırlanacak',
  // Ünvan kelimeleri (tek başına)
  'yetkili', 'yetkilisi', 'sahibi', 'müdürü', 'müdür', 'direktörü',
  'direktorü', 'sorumlusu', 'teknik',
  // Kurumlar
  'trassir', 'firma', 'müşteri', 'teklif', 'teklifi', 'proje', 'projesi',
  'ziraat', 'garanti', 'halkbank', 'akbank', 'site', 'bina', 'otel',
])

// ZNA çalışanları — muhatap değil, ilgili kişi olarak eklemeyelim
const ZNA_CALISANLARI = new Set([
  'ali', 'ali uğur', 'ahmet', 'berkay', 'sefa', 'anılcan',
  'sadık', 'salih', 'tarık', 'oğuz', 'ferdi', 'abdullah',
])

const temizle = (v) => String(v == null ? '' : v).trim()

// ── 1. Excel oku ──
console.log('📂 Görüşme Excel okunuyor...')
const wb = XLSX.readFile(EXCEL)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır\n`)

// ── 2. Müşterileri çek (pagination) ──
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
const kodMap = new Map(musteriler.map(m => [m.kod, m]))
console.log(`   → ${kodMap.size} müşteri\n`)

// ── 3. Mevcut kişileri çek (duplicate önleme) ──
console.log('👥 Mevcut kişiler yükleniyor...')
const mevcutKisiler = []
off = 0
while (true) {
  const { data } = await supabase.from('musteri_kisiler').select('musteri_id, ad').range(off, off + 999)
  if (!data || data.length === 0) break
  mevcutKisiler.push(...data)
  if (data.length < 1000) break
  off += 1000
}
const mevcutSet = new Set(mevcutKisiler.map(k => `${k.musteri_id}|${(k.ad || '').toLowerCase()}`))
console.log(`   → ${mevcutKisiler.length} mevcut kişi\n`)

// ── 4. Regex ile isim çıkar ──
const firmaKisiler = new Map()  // musteri_id → Map(adLower → {ad, unvan})

rows.forEach(r => {
  const kod = temizle(r.Kodu)
  if (!kod) return
  const musteri = kodMap.get(kod)
  if (!musteri) return

  const aciklama = String(r['Açıklama'] || '')
  if (!aciklama) return

  const matches = [...aciklama.matchAll(beyRegex)]
  matches.forEach(m => {
    const rawIsim = m[1].trim()
    const unvan = m[2].toLowerCase() === 'hanım' ? 'hanım' : 'bey'
    const isimLower = rawIsim.toLowerCase()
    const ilkKelime = isimLower.split(/\s+/)[0]

    // Kara listede mi? (tam eşleşme)
    if (KARA_LISTE.has(ilkKelime)) return
    if (KARA_LISTE.has(isimLower)) return
    // ZNA çalışanı mı? (tam eşleşme)
    if (ZNA_CALISANLARI.has(ilkKelime)) return
    if (ZNA_CALISANLARI.has(isimLower)) return
    // Çok kısa?
    if (rawIsim.length < 3) return

    if (!firmaKisiler.has(musteri.id)) firmaKisiler.set(musteri.id, new Map())
    const map = firmaKisiler.get(musteri.id)
    if (!map.has(isimLower)) map.set(isimLower, { ad: rawIsim, unvan, firmaAdi: musteri.firma, musteriKod: musteri.kod })
  })
})

// ── 5. Eklenecekleri hazırla (mevcutları atla) ──
const eklenecekler = []
let atlanan = 0
for (const [musteri_id, kisiMap] of firmaKisiler.entries()) {
  for (const kisi of kisiMap.values()) {
    const key = `${musteri_id}|${kisi.ad.toLowerCase()}`
    if (mevcutSet.has(key)) { atlanan++; continue }
    // İsmi parse et: "Ali Uğur" → ad:"Ali", soyad:"Uğur"
    const parcalar = kisi.ad.split(/\s+/).filter(Boolean)
    const ad = parcalar[0]
    const soyad = parcalar.slice(1).join(' ') || ''
    eklenecekler.push({
      musteri_id,
      ad,
      soyad,
      unvan: kisi.unvan === 'hanım' ? 'Hanım' : 'Bey',
      telefon: '',
      email: '',
      ana_kisi: false,
      olusturma_tarih: new Date().toISOString(),
      _firmaAdi: kisi.firmaAdi,   // sadece dry-run için
      _musteriKod: kisi.musteriKod,
    })
  }
}

// Aynı ismi sadece bir kez ekleyeyim (farklı firmalarda da olabilir)
console.log('📊 SONUÇ')
console.log(`   ├─ İşlenmiş firma: ${firmaKisiler.size}`)
console.log(`   ├─ Eklenecek kişi: ${eklenecekler.length}`)
console.log(`   └─ Atlanan (zaten var): ${atlanan}\n`)

// ── 6. Tam liste ──
console.log('👀 EKLENECEK KİŞİLER (firma bazında)')
const firmaDokum = new Map()
for (const k of eklenecekler) {
  const key = `${k._musteriKod} | ${k._firmaAdi}`
  if (!firmaDokum.has(key)) firmaDokum.set(key, [])
  firmaDokum.get(key).push(`${k.ad}${k.soyad ? ' ' + k.soyad : ''} (${k.unvan})`)
}
let firmaSira = 1
for (const [firma, isimler] of firmaDokum.entries()) {
  console.log(`   ${firmaSira++}. ${firma}`)
  console.log(`      → ${isimler.join(', ')}`)
}
console.log('')

if (DRY) {
  console.log('🧪 DRY-RUN — hiçbir şey yazılmadı.')
  console.log('   Commit: node scripts/import-musteri-kisileri.mjs --commit')
  process.exit(0)
}

// ── 7. Commit ──
if (eklenecekler.length === 0) {
  console.log('✅ Eklenecek kişi yok.')
  process.exit(0)
}

console.log('💾 Yazılıyor...')
const rows_final = eklenecekler.map(({ _firmaAdi, _musteriKod, ...rest }) => rest)

const { data, error } = await supabase.from('musteri_kisiler').insert(rows_final).select('id')
if (error) {
  console.error('❌', error.message)
  process.exit(1)
}
console.log(`✅ ${data.length} kişi başarıyla eklendi.`)
