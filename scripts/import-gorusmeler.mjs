/**
 * GÖRÜŞME LİSTESİ IMPORT SCRIPT
 *
 * Kullanım:
 *   node scripts/import-gorusmeler.mjs --dry-run
 *   node scripts/import-gorusmeler.mjs --commit
 *
 * Excel kolonları:
 *   Kodu → musteriler.kod ile eşleşir (musteri_id, firma_adi çıkarılır)
 *   Aktivite → konu
 *   İrtibat Şekli → irtibat_sekli (normalize edilir)
 *   Açıklama → takip_notu
 *   Görüşen → gorusen
 *   Takip Kodu → ATLANIR (kullanıcı istemedi)
 *   Tarih → tarih (YYYY-MM-DD format)
 */
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// .env oku
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=').map(s => s.trim())))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const EXCEL_YOLU = 'C:/Users/MSI-LAPTOP/Downloads/Görüşme listesi.xlsx'
const DRY_RUN = !process.argv.includes('--commit')
const BATCH_BOYUT = 200

// İrtibat şekli normalizasyonu (Excel'deki değerleri bizim ID'lerimize çevir)
const irtibatMap = {
  'TELEFON':         'telefon',
  'WHATSAAP':        'whatsapp',
  'WHATSAPP':        'whatsapp',
  'MAİL':            'mail',
  'MAIL':            'mail',
  'YÜZ YÜZE':        'yuz_yuze',
  'MERKEZ':          'merkez',
  'UZAK BAĞLANTI':   'uzak_baglanti',
  'BRİDGE':          'bridge',
  'BRIDGE':          'bridge',
  'ONLİNE TOPLANTI': 'online_toplanti',
  'TELEGRAM':        'telegram',
}

// Tarih parse: "21.04.2026 00:00:00" ya da "9.04.2026 00:00:00" → "2026-04-21"
const parseTarih = (s) => {
  if (s == null || s === '') return null
  // Excel serial number (number)
  if (typeof s === 'number') {
    const d = XLSX.SSF.parse_date_code(s)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  // String: D.M.YYYY veya DD.MM.YYYY
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, g, a, y] = m
  return `${y}-${a.padStart(2, '0')}-${g.padStart(2, '0')}`
}

const temizle = (v) => String(v || '').trim()

// ── 1. Excel oku ────────────────────────────────────────────────
console.log('📂 Excel okunuyor:', EXCEL_YOLU)
const wb = XLSX.readFile(EXCEL_YOLU)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır okundu\n`)

// ── 2. Müşterileri yükle (kod ↔ id eşleme için) — PAGINATION İLE ──
console.log('🔎 Müşteriler yükleniyor (kod ↔ id eşlemesi için)...')
const musteriler = []
let offset = 0
const sayfaBoyut = 1000
while (true) {
  const { data, error } = await supabase
    .from('musteriler')
    .select('id, kod, firma')
    .range(offset, offset + sayfaBoyut - 1)
  if (error) { console.error('❌', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  musteriler.push(...data)
  if (data.length < sayfaBoyut) break
  offset += sayfaBoyut
}

const musteriKodMap = new Map()
musteriler.forEach(m => musteriKodMap.set(m.kod, m))
console.log(`   → ${musteriKodMap.size} müşteri yüklendi\n`)

// ── 3. Satırları temizle ve dönüştür ───────────────────────────
const hatalar = { mKodBos: 0, mBulunamadi: 0, tarihYok: 0, konuYok: 0 }
const gorusmeler = []

rows.forEach((r, i) => {
  const kod = temizle(r.Kodu)
  if (!kod) { hatalar.mKodBos++; return }

  const musteri = musteriKodMap.get(kod)
  if (!musteri) { hatalar.mBulunamadi++; return }

  const tarih = parseTarih(r.Tarih)
  if (!tarih) { hatalar.tarihYok++; return }

  let konu = temizle(r.Aktivite)
  if (!konu) {
    hatalar.konuYok++
    konu = '(Belirtilmemiş)'  // boş atlamak yerine placeholder ile al
  }

  const irtibatRaw = temizle(r['İrtibat Şekli']).toUpperCase()
  const irtibatSekli = irtibatMap[irtibatRaw] || null

  // AKT-0001 tarzı benzersiz akt_no (i+1)
  const aktNo = `ACT-${String(i + 1).padStart(5, '0')}`

  gorusmeler.push({
    akt_no: aktNo,
    musteri_id: musteri.id,
    firma_adi: musteri.firma,
    konu: konu,
    irtibat_sekli: irtibatSekli,
    gorusen: temizle(r['Görüşen']) || '',
    muhatap_ad: temizle(r['Görüşülen']) || '',
    takip_notu: temizle(r['Açıklama']).replace(/\r\n/g, '\n').trim() || '',
    durum: 'kapali', // geçmiş kayıtlar — hepsi kapalı
    tarih,
    olusturma_tarih: new Date(tarih).toISOString(),
  })
})

console.log('📊 İŞLEME SONUCU')
console.log(`   ├─ Geçerli kayıt: ${gorusmeler.length}`)
console.log(`   ├─ Kod boş: ${hatalar.mKodBos}`)
console.log(`   ├─ Müşteri bulunamadı: ${hatalar.mBulunamadi}`)
console.log(`   ├─ Tarih yok: ${hatalar.tarihYok}`)
console.log(`   └─ Konu yok: ${hatalar.konuYok}\n`)

// ── 4. İrtibat şekli dağılımı ──────────────────────────────────
const iSayac = {}
gorusmeler.forEach(g => {
  const k = g.irtibat_sekli || '(yok)'
  iSayac[k] = (iSayac[k] || 0) + 1
})
console.log('📞 İRTİBAT ŞEKLİ DAĞILIMI')
Object.entries(iSayac).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(`   ├─ ${k}: ${v}`))
console.log('')

// ── 5. İlk 3 örnek ─────────────────────────────────────────────
console.log('👀 İLK 3 ÖRNEK')
gorusmeler.slice(0, 3).forEach((g, i) => {
  console.log(`   ${i + 1}. ${g.firma_adi}`)
  console.log(`      Konu       : ${g.konu}`)
  console.log(`      İrtibat    : ${g.irtibat_sekli || '—'}`)
  console.log(`      Tarih      : ${g.tarih}`)
  console.log(`      Akt No     : ${g.akt_no}`)
  console.log(`      Not        : ${(g.takip_notu || '').substring(0, 80)}...`)
  console.log('')
})

if (DRY_RUN) {
  console.log('🧪 DRY-RUN — hiçbir şey yazılmadı.')
  console.log('   Gerçek import: node scripts/import-gorusmeler.mjs --commit')
  process.exit(0)
}

// ── 6. Gerçek import ───────────────────────────────────────────
console.log('💾 IMPORT BAŞLIYOR...')
let yazilanToplam = 0
let hataliToplam = 0

for (let i = 0; i < gorusmeler.length; i += BATCH_BOYUT) {
  const batch = gorusmeler.slice(i, i + BATCH_BOYUT)
  const { data, error } = await supabase.from('gorusmeler').insert(batch).select('id')
  if (error) {
    console.error(`   ❌ Batch ${Math.floor(i / BATCH_BOYUT) + 1}:`, error.message)
    hataliToplam += batch.length
  } else {
    yazilanToplam += data?.length || 0
    process.stdout.write(`\r   ⏳ ${yazilanToplam}/${gorusmeler.length}...`)
  }
}

console.log('\n\n✅ TAMAMLANDI')
console.log(`   ├─ Yazılan: ${yazilanToplam}`)
console.log(`   └─ Hatalı:  ${hataliToplam}`)
