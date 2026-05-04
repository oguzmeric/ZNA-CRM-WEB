// Trassir şablonu — A4 dikey, multi-section workbook
// Sayfa kırılmaları ile 5 bölüm: kapak / anlatı / fiyatlandırma / iş ortakları / referanslar
import ExcelJS from 'exceljs'
import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ } from '../teklifTemplates'
import { gorseliCek } from './index'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

export async function trassirExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ZNA CRM'
  const ws = wb.addWorksheet('Teklif', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  })

  ws.columns = [
    { width: 4 },  { width: 18 }, { width: 35 }, { width: 12 },
    { width: 16 }, { width: 16 }, { width: 4 },
  ]

  // ===========  Sayfa 1 — Kapak  ===========
  const kapakBuf = await gorseliCek('/teklif-assets/zna-cover.png')
  const kapakImgId = wb.addImage({ buffer: kapakBuf, extension: 'png' })
  ws.addImage(kapakImgId, { tl: { col: 0, row: 0 }, ext: { width: 595, height: 842 } })
  // Sayfa 1'in sonuna kadar boş satır ekle
  for (let i = 0; i < 40; i++) ws.addRow([])
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 2 — Anlatı  ===========
  let row = ws.addRow(['', 'Fiyat Teklifi'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 24, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 36

  ws.addRow([])

  row = ws.addRow(['', `Sayın ${teklif.firmaAdi || ''}`])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { bold: true, size: 12 }

  row = ws.addRow(['', TRASSIR_KARSILAMA])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  row.height = 110

  ws.addRow([])

  row = ws.addRow(['', 'ZNA Hakkında'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).border = { bottom: { style: 'medium', color: { argb: 'FF0176D3' } } }

  row = ws.addRow(['', ZNA_HAKKINDA])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  row.height = 130

  ws.addRow([])

  row = ws.addRow(['', 'Hizmetlerimiz'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).border = { bottom: { style: 'medium', color: { argb: 'FF0176D3' } } }

  HIZMETLERIMIZ.forEach(h => {
    const r = ws.addRow(['', `•  ${h}`])
    ws.mergeCells(`B${r.number}:F${r.number}`)
  })
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 3 — Fiyatlandırma  ===========
  row = ws.addRow(['', `Tarih : ${fmtTarih(teklif.tarih)}`, '', '', '', `Hazırlayan : ${teklif.hazirlayan || '—'}`])
  row.getCell(2).font = { bold: true }
  row.getCell(6).font = { bold: true }

  ws.addRow([])
  row = ws.addRow(['', 'Fiyatlandırma'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 18, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 26
  ws.addRow([])

  // Tablo başlığı
  const headerRow = ws.addRow(['', 'Marka', 'Açıklama', 'Ad./Mt.', 'Birim Fiyat', 'Toplam Fiyat'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 22
  ;[2, 3, 4, 5, 6].forEach(c => {
    headerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0176D3' } }
    headerRow.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  let araToplam = 0
  ;(teklif.satirlar || []).forEach((s, i) => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const top = ara - isk
    araToplam += top
    const r = ws.addRow([
      '',
      s.marka || (s.stokKodu ? '—' : 'ZNA'),
      s.stokAdi || '',
      `${s.miktar} ${s.birim || ''}`,
      `${paraSembol}${(s.birimFiyat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
      `${paraSembol}${top.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
    ])
    if (i % 2) {
      ;[2, 3, 4, 5, 6].forEach(c => r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } })
    }
    ;[2, 3, 4, 5, 6].forEach(c => r.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })
    r.getCell(4).alignment = { horizontal: 'right' }
    r.getCell(5).alignment = { horizontal: 'right' }
    r.getCell(6).alignment = { horizontal: 'right' }
    r.getCell(6).font = { bold: true }
  })

  ws.addRow([])
  const kdvToplam = araToplam * 0.20
  const yaz = (etiket, deger, kalin = false) => {
    const r = ws.addRow(['', '', '', '', etiket, deger])
    r.getCell(5).alignment = { horizontal: 'right' }
    r.getCell(6).alignment = { horizontal: 'right' }
    if (kalin) {
      r.getCell(5).font = { bold: true, color: { argb: 'FF0176D3' } }
      r.getCell(6).font = { bold: true, color: { argb: 'FF0176D3' } }
      r.getCell(5).border = { top: { style: 'medium', color: { argb: 'FF0176D3' } } }
      r.getCell(6).border = { top: { style: 'medium', color: { argb: 'FF0176D3' } } }
    }
  }
  yaz('Ara Tutar :', `${paraSembol}${araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`)
  yaz('Kdv % 20 :', `${paraSembol}${kdvToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`)
  yaz('Genel Toplam :', `${paraSembol}${(araToplam + kdvToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, true)

  if (teklif.aciklama) {
    ws.addRow([])
    const r = ws.addRow(['', `Açıklama : ${teklif.aciklama}`])
    ws.mergeCells(`B${r.number}:F${r.number}`)
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    r.height = 50
  }
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 4 — İş Ortakları  ===========
  row = ws.addRow(['', 'İş Ortaklarımız'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 22, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 32

  const ortakBuf = await gorseliCek('/teklif-assets/is-ortaklari.png')
  const ortakImgId = wb.addImage({ buffer: ortakBuf, extension: 'png' })
  const ortakStartRow = ws.lastRow.number + 1
  for (let i = 0; i < 30; i++) ws.addRow([])
  ws.addImage(ortakImgId, { tl: { col: 1, row: ortakStartRow }, ext: { width: 600, height: 540 } })
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 5 — Referanslar  ===========
  row = ws.addRow(['', 'Bazı Referanslarımız'])
  ws.mergeCells(`B${row.number}:F${row.number}`)
  row.getCell(2).font = { size: 22, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 32

  const refBuf = await gorseliCek('/teklif-assets/referanslar.png')
  const refImgId = wb.addImage({ buffer: refBuf, extension: 'png' })
  const refStartRow = ws.lastRow.number + 1
  for (let i = 0; i < 30; i++) ws.addRow([])
  ws.addImage(refImgId, { tl: { col: 1, row: refStartRow }, ext: { width: 600, height: 540 } })

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
