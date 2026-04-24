/**
 * SERVİS RAPORLARI IMPORT SCRIPT
 *
 * Kullanım:
 *   node scripts/import-servis-raporlari.mjs --dry-run
 *   node scripts/import-servis-raporlari.mjs --commit
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

const EXCEL = 'C:/Users/MSI-LAPTOP/Downloads/Servis raporları.xlsx'
const DRY = !process.argv.includes('--commit')
const BATCH = 500

const temizle = (v) => String(v == null ? '' : v).trim()

// "22.04.2026 00:00:00" → "2026-04-22"
const parseTarih = (s) => {
  if (!s) return null
  if (typeof s === 'number') {
    const d = XLSX.SSF.parse_date_code(s)
    if (!d || (d.y === 1899 && d.m === 12 && d.d === 30)) return null
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, g, a, y] = m
  if (y === '1899') return null
  return `${y}-${a.padStart(2,'0')}-${g.padStart(2,'0')}`
}

// 1. Excel oku
console.log('📂 Excel okunuyor...')
const wb = XLSX.readFile(EXCEL)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
console.log(`   → ${rows.length} satır\n`)

// 2. Müşterileri çek (pagination)
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

// 3. Mevcut raporları çek (duplicate önleme)
console.log('📊 Mevcut raporlar kontrol ediliyor...')
const mevcutFisler = new Set()
off = 0
while (true) {
  const { data } = await supabase.from('servis_raporlari').select('fis_no').range(off, off + 999)
  if (!data || data.length === 0) break
  data.forEach(r => mevcutFisler.add(r.fis_no))
  if (data.length < 1000) break
  off += 1000
}
console.log(`   → ${mevcutFisler.size} mevcut\n`)

// 4. Hazırla
const hata = { fisYok: 0, atlanan: 0, mYok: 0 }
const raporlar = []

rows.forEach(r => {
  const fisNo = temizle(r['Fiş.No'])
  if (!fisNo) { hata.fisYok++; return }
  if (mevcutFisler.has(fisNo)) { hata.atlanan++; return }

  const cariKodu = temizle(r['C.H.Kodu'])
  const musteri = kodMap.get(cariKodu)
  if (!musteri) hata.mYok++

  raporlar.push({
    fis_no: fisNo,
    takip_kodu: temizle(r['Takip Kodu']) || null,
    musteri_id: musteri?.id || null,
    firma_adi: temizle(r['Firma / Müşteri Adı']) || musteri?.firma || null,
    cari_kodu: cariKodu || null,
    lokasyon: temizle(r['Lokasyon']) || null,
    sistem_no: temizle(r['Sis.No']) || null,
    ariza_kodu: temizle(r['Arıza Kodu']) || null,
    bildirilen_ariza: temizle(r['Bildirilen Arıza']) || null,
    sonuc: temizle(r['Sonuç']) || null,
    teknisyen: temizle(r['Teknisyen']) || null,
    bildiren: temizle(r['Bildiren']) || null,
    bil_tarih: parseTarih(r['Bil.Tarih']),
    gid_tarih: parseTarih(r['Gid.Tarih']),
  })
})

console.log('📊 İŞLEME')
console.log(`   ├─ Eklenecek:        ${raporlar.length}`)
console.log(`   ├─ Mevcut (atlandı): ${hata.atlanan}`)
console.log(`   ├─ Fiş No boş:       ${hata.fisYok}`)
console.log(`   └─ Müşteri yok:      ${hata.mYok} (yine de eklendi)\n`)

// İstatistik
const teknisyenler = {}
raporlar.forEach(r => { if (r.teknisyen) teknisyenler[r.teknisyen] = (teknisyenler[r.teknisyen] || 0) + 1 })
console.log('👨‍🔧 TEKNİSYENLER (top 10)')
Object.entries(teknisyenler).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(`   ├─ ${k}: ${v}`))

const sistemler = {}
raporlar.forEach(r => { if (r.sistem_no) sistemler[r.sistem_no] = (sistemler[r.sistem_no] || 0) + 1 })
console.log('\n🔧 SİSTEMLER (top 10)')
Object.entries(sistemler).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(`   ├─ ${k}: ${v}`))

console.log('\n👀 İLK 3 ÖRNEK')
raporlar.slice(0, 3).forEach((r, i) => {
  console.log(`   ${i+1}. ${r.fis_no} - ${r.firma_adi}`)
  console.log(`      Sistem: ${r.sistem_no} | Teknisyen: ${r.teknisyen}`)
  console.log(`      Sonuç:  ${(r.sonuc || '').substring(0, 80)}...\n`)
})

if (DRY) {
  console.log('🧪 DRY-RUN — yazma yok.')
  console.log('   Commit: node scripts/import-servis-raporlari.mjs --commit')
  process.exit(0)
}

// 5. Commit
if (raporlar.length === 0) { console.log('✅ Eklenecek yok.'); process.exit(0) }

console.log('💾 IMPORT BAŞLIYOR...')
let yazilan = 0, hatali = 0

for (let i = 0; i < raporlar.length; i += BATCH) {
  const batch = raporlar.slice(i, i + BATCH)
  const { data, error } = await supabase.from('servis_raporlari').insert(batch).select('id')
  if (error) {
    console.error(`\n   ❌ Batch ${Math.floor(i/BATCH)+1}:`, error.message)
    hatali += batch.length
  } else {
    yazilan += data?.length || 0
    process.stdout.write(`\r   ⏳ ${yazilan}/${raporlar.length}...`)
  }
}

console.log('\n\n✅ TAMAMLANDI')
console.log(`   ├─ Yazılan: ${yazilan}`)
console.log(`   └─ Hatalı:  ${hatali}`)
