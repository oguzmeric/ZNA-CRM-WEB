// Karel şablonu — A4 yatay, tek sheet, kompakt mektup
import ExcelJS from 'exceljs'
import { ZNA_FIRMA } from '../teklifTemplates'
import { gorseliCek } from './index'
import { supabase } from '../supabase'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

async function musteriTelefonGetir(firmaAdi) {
  if (!firmaAdi) return ''
  try {
    const { data } = await supabase
      .from('musteriler')
      .select('telefon')
      .eq('firma', firmaAdi)
      .limit(1)
      .maybeSingle()
    return data?.telefon || ''
  } catch {
    return ''
  }
}

export async function karelExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ZNA CRM'
  const ws = wb.addWorksheet('Teklif', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  // Kolon genişlikleri (toplam ~16 kolon, landscape A4)
  ws.columns = [
    { width: 2 },   { width: 12 },  // A, B
    { width: 24 },  { width: 22 },  // C, D
    { width: 4 },   { width: 12 },  // E, F
    { width: 16 },  { width: 4 },   // G, H
    { width: 8 },   { width: 6 },   // I, J
    { width: 12 },  { width: 14 },  // K, L
    { width: 14 },  { width: 4 },   // M, N
    { width: 12 },  { width: 14 },  // O, P
  ]

  // ============== Üst banner — iki logo (sıra 1)
  ws.getRow(1).height = 56

  const znaLogoBuf = await gorseliCek('/teklif-assets/zna-logo.jpg')
  const znaLogoId = wb.addImage({ buffer: znaLogoBuf, extension: 'jpeg' })
  ws.addImage(znaLogoId, { tl: { col: 1, row: 0 }, ext: { width: 220, height: 70 } })

  const karelLogoBuf = await gorseliCek('/teklif-assets/karel-is-ortagi.png')
  const karelLogoId = wb.addImage({ buffer: karelLogoBuf, extension: 'png' })
  ws.addImage(karelLogoId, { tl: { col: 12, row: 0 }, ext: { width: 200, height: 64 } })

  // ============== Firma bilgi banner (sıra 2)
  ws.mergeCells('A2:P2')
  const banner = ws.getCell('A2')
  banner.value = `UNVAN: ${ZNA_FIRMA.unvan}     ADRES: ${ZNA_FIRMA.adres}     TEL/FAX: ${ZNA_FIRMA.telFax}`
  banner.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  banner.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  ws.getRow(2).height = 22

  ws.addRow([]) // sıra 3 (boşluk)

  // ============== Bilgi grid'i (sıra 4-6)
  const tel = await musteriTelefonGetir(teklif.firmaAdi)
  const bilgiSatirlari = [
    [{ k: 'Sayın :',  v: teklif.firmaAdi },           { k: 'Tarih:',      v: fmtTarih(teklif.tarih) }],
    [{ k: 'Tel :',    v: tel },                        { k: 'Evrak No:',   v: teklif.teklifNo || '' }],
    [{ k: 'Konu :',   v: teklif.konu || '' },         { k: 'Hazırlayan:', v: teklif.hazirlayan || '' }],
  ]
  bilgiSatirlari.forEach((cols) => {
    const r = ws.addRow([])
    r.height = 18
    // sol blok
    r.getCell(2).value = cols[0].k
    r.getCell(2).font = { bold: true }
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    ws.mergeCells(`C${r.number}:G${r.number}`)
    r.getCell(3).value = cols[0].v
    r.getCell(3).border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    // sağ blok
    r.getCell(9).value = cols[1].k
    r.getCell(9).font = { bold: true }
    r.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    ws.mergeCells(`K${r.number}:P${r.number}`)
    r.getCell(11).value = cols[1].v
    r.getCell(11).border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })

  ws.addRow([]) // boşluk

  // ============== Başlık (FİYAT TEKLİFİ)
  const baslikRow = ws.addRow([])
  baslikRow.height = 24
  ws.mergeCells(`A${baslikRow.number}:P${baslikRow.number}`)
  baslikRow.getCell(1).value = 'FİYAT TEKLİFİ'
  baslikRow.getCell(1).font = { size: 14, bold: true, color: { argb: 'FF1E3A8A' } }
  baslikRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ============== Tablo başlığı
  // Kolon planı: B=Marka, C-D=Açıklama, E-F=Miktar, G-H=Birim, I-K=Birim Fiyat, L-N=Toplam Fiyat
  const headerRow = ws.addRow([])
  headerRow.height = 22
  const setHeader = (cell, val) => {
    headerRow.getCell(cell).value = val
    headerRow.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    headerRow.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' }
  }
  setHeader(2, 'Marka')
  setHeader(3, 'Açıklama')
  setHeader(5, 'Miktar')
  setHeader(7, 'Birim')
  setHeader(9, 'Birim Fiyat')
  setHeader(13, 'Toplam Fiyat')
  ws.mergeCells(`C${headerRow.number}:D${headerRow.number}`)
  ws.mergeCells(`E${headerRow.number}:F${headerRow.number}`)
  ws.mergeCells(`G${headerRow.number}:H${headerRow.number}`)
  ws.mergeCells(`I${headerRow.number}:L${headerRow.number}`)
  ws.mergeCells(`M${headerRow.number}:P${headerRow.number}`)
  ;[2, 3, 5, 7, 9, 13].forEach(c => {
    headerRow.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  let araToplam = 0
  ;(teklif.satirlar || []).forEach((s, idx) => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const top = ara - isk
    araToplam += top

    const r = ws.addRow([])
    r.height = 18
    r.getCell(2).value = s.marka || (s.stokKodu ? '—' : 'ZNA')
    r.getCell(2).font = { bold: true }
    r.getCell(3).value = s.stokAdi || ''
    r.getCell(5).value = s.miktar
    r.getCell(5).alignment = { horizontal: 'right' }
    r.getCell(7).value = s.birim || ''
    r.getCell(9).value = `${paraSembol}${(s.birimFiyat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
    r.getCell(9).alignment = { horizontal: 'right' }
    r.getCell(13).value = `${paraSembol}${top.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
    r.getCell(13).alignment = { horizontal: 'right' }
    r.getCell(13).font = { bold: true }

    ws.mergeCells(`C${r.number}:D${r.number}`)
    ws.mergeCells(`E${r.number}:F${r.number}`)
    ws.mergeCells(`G${r.number}:H${r.number}`)
    ws.mergeCells(`I${r.number}:L${r.number}`)
    ws.mergeCells(`M${r.number}:P${r.number}`)

    ;[2, 3, 5, 7, 9, 13].forEach(c => {
      r.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      if (idx % 2) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    })
  })

  // ============== Toplamlar (sağ alt)
  ws.addRow([])
  const kdvToplam = araToplam * 0.20
  const toplamYaz = (etiket, deger, kalin = false) => {
    const r = ws.addRow([])
    r.height = 18
    r.getCell(9).value = etiket
    r.getCell(9).alignment = { horizontal: 'right' }
    r.getCell(13).value = deger
    r.getCell(13).alignment = { horizontal: 'right' }
    ws.mergeCells(`I${r.number}:L${r.number}`)
    ws.mergeCells(`M${r.number}:P${r.number}`)
    if (kalin) {
      r.getCell(9).font = { bold: true, color: { argb: 'FF1E3A8A' } }
      r.getCell(13).font = { bold: true, color: { argb: 'FF1E3A8A' } }
      r.getCell(9).border = { top: { style: 'medium', color: { argb: 'FF1E3A8A' } } }
      r.getCell(13).border = { top: { style: 'medium', color: { argb: 'FF1E3A8A' } } }
    }
  }
  toplamYaz('Toplam :', `${paraSembol}${araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`)
  toplamYaz('KDV (%20) :', `${paraSembol}${kdvToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`)
  toplamYaz('Genel Toplam :', `${paraSembol}${(araToplam + kdvToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, true)

  // ============== Not (sol alt)
  if (teklif.aciklama) {
    ws.addRow([])
    const r = ws.addRow([])
    r.getCell(2).value = `Not: ${teklif.aciklama}`
    r.getCell(2).font = { italic: true }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    ws.mergeCells(`B${r.number}:G${r.number}`)
    r.height = 40
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
