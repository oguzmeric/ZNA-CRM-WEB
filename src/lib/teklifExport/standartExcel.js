// Standart şablon — basit fallback Excel (görselsiz, tek sheet)
import ExcelJS from 'exceljs'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

export async function standartExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Teklif')

  ws.columns = [
    { width: 5 },   // #
    { width: 38 },  // Ürün/Hizmet
    { width: 10 },  // Miktar
    { width: 10 },  // Birim
    { width: 14 },  // Birim Fiyat
    { width: 8 },   // İsk%
    { width: 8 },   // KDV%
    { width: 16 },  // Toplam
  ]

  ws.mergeCells('A1:H1')
  const baslik = ws.getCell('A1')
  baslik.value = `TEKLİF — ${teklif.teklifNo}  (${teklif.firmaAdi || ''})`
  baslik.font = { size: 16, bold: true, color: { argb: 'FF0176D3' } }
  baslik.alignment = { horizontal: 'center' }
  ws.getRow(1).height = 28

  ws.addRow([])
  ws.addRow(['Tarih', fmtTarih(teklif.tarih), '', '', 'Hazırlayan', teklif.hazirlayan || ''])
  ws.addRow(['Konu', teklif.konu || ''])
  if (teklif.musteriYetkilisi) ws.addRow(['Yetkili', teklif.musteriYetkilisi])
  ws.addRow([])

  const headerRow = ws.addRow(['#', 'Ürün/Hizmet', 'Miktar', 'Birim', 'Birim Fiyat', 'İsk%', 'KDV%', 'Toplam'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0176D3' } }
  headerRow.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })

  let araToplam = 0
  let kdvToplam = 0
  ;(teklif.satirlar || []).forEach((s, i) => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const kdvT = (ara - isk) * ((s.kdv || 20) / 100)
    const top = ara - isk + kdvT
    araToplam += ara - isk
    kdvToplam += kdvT
    const r = ws.addRow([i + 1, s.stokAdi || '', s.miktar, s.birim || '', s.birimFiyat, s.iskonto || 0, s.kdv || 20, top])
    r.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })
  })

  ws.addRow([])
  ws.addRow(['', '', '', '', '', '', 'Ara Toplam', araToplam]).font = { italic: true }
  ws.addRow(['', '', '', '', '', '', 'KDV Toplam', kdvToplam]).font = { italic: true }
  const gtRow = ws.addRow(['', '', '', '', '', '', 'GENEL TOPLAM', araToplam + kdvToplam])
  gtRow.font = { bold: true, size: 12, color: { argb: 'FF0176D3' } }
  gtRow.eachCell((c, col) => { if (col === 7 || col === 8) c.border = { top: { style: 'medium' } } })

  if (teklif.aciklama) {
    ws.addRow([])
    const r = ws.addRow(['Açıklama:', teklif.aciklama])
    r.getCell(1).font = { bold: true }
    ws.mergeCells(`B${r.number}:H${r.number}`)
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
