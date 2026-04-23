/**
 * Servis raporları.xlsx → public/data/servis-raporlari.json
 *
 * Çalıştırma: node scripts/parse-servis-raporlari.mjs
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = 'C:/Users/MSI-LAPTOP/Desktop/Servis raporları.xlsx'
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'data')
const OUT = path.join(OUT_DIR, 'servis-raporlari.json')

fs.mkdirSync(OUT_DIR, { recursive: true })

const wb = XLSX.readFile(FILE)
const sheet = wb.Sheets[wb.SheetNames[0]]
const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

// "22.04.2026 00:00:00" → "2026-04-22"
const normTarih = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, g, a, y] = m
  if (y === '1899') return null
  return `${y}-${a.padStart(2, '0')}-${g.padStart(2, '0')}`
}

const clean = (v) => (v == null ? '' : String(v).trim())

const rows = raw.map((r, i) => ({
  i,
  takipKodu:   clean(r['Takip Kodu']),
  fisNo:       clean(r['Fiş.No']),
  firma:       clean(r['Firma / Müşteri Adı']),
  sonuc:       clean(r['Sonuç']),
  arizaKodu:   clean(r['Arıza Kodu']),
  teknisyen:   clean(r['Teknisyen']),
  chKodu:      clean(r['C.H.Kodu']),
  lokasyon:    clean(r['Lokasyon']),
  sisNo:       clean(r['Sis.No']),
  bildiren:    clean(r['Bildiren']),
  bilTarih:    normTarih(r['Bil.Tarih']),
  bildirilen:  clean(r['Bildirilen Arıza']),
  gidTarih:    normTarih(r['Gid.Tarih']),
}))

fs.writeFileSync(OUT, JSON.stringify(rows))
console.log(`✓ ${rows.length} kayıt → ${OUT}`)
console.log(`  Boyut: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`)
