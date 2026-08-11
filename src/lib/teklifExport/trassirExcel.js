// Trassir şablonu — A4 dikey, multi-section workbook
// Sayfa kırılmaları ile 5 bölüm: kapak / anlatı / fiyatlandırma / iş ortakları / referanslar
import ExcelJS from 'exceljs'
import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ } from '../teklifTemplates'
import { gorseliCek } from './index'
import { teklifHesapla, kdvSatirlari, iskontoEtiketi, satirIskontoMetni, oranMetni, tutarMetni } from '../teklifHesap'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

export async function trassirExcelOlustur(teklif) {
  const h = teklifHesapla(teklif)
  // İskonto kolonu yalnız iskontolu teklifte açılır; açıldığında fiyat tablosu
  // B–G, kapalıyken B–F kolonlarını kullanır (merge'ler ve toplam bloğu buna bağlı).
  const iskKolon = h.satirIskontoVar
  const tabloKolonlari = iskKolon ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6]
  const sonSutun = iskKolon ? 'G' : 'F'

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ZNA CRM'
  const ws = wb.addWorksheet('Teklif', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  })

  ws.columns = iskKolon
    ? [{ width: 4 }, { width: 16 }, { width: 32 }, { width: 11 },
       { width: 14 }, { width: 10 }, { width: 16 }]
    : [{ width: 4 }, { width: 18 }, { width: 35 }, { width: 12 },
       { width: 16 }, { width: 16 }, { width: 4 }]

  // ZNA logosu — content sayfalarına embed için bir kez yükle
  const znaLogoBuf = await gorseliCek('/teklif-assets/zna-logo.jpg')
  const znaLogoId = wb.addImage({ buffer: znaLogoBuf, extension: 'jpeg' })

  // ===========  Sayfa 1 — Kapak  ===========
  const kapakBuf = await gorseliCek('/teklif-assets/zna-cover.png')
  const kapakImgId = wb.addImage({ buffer: kapakBuf, extension: 'png' })
  ws.addImage(kapakImgId, { tl: { col: 0, row: 0 }, ext: { width: 595, height: 842 } })
  // Sayfa 1'in sonuna kadar boş satır ekle
  for (let i = 0; i < 40; i++) ws.addRow([])
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 2 — Anlatı  ===========
  // ZNA logosu — sayfa 2 sol üst
  const sayfa2BaslangicSatir = ws.lastRow ? ws.lastRow.number : 0
  ws.addImage(znaLogoId, { tl: { col: 0, row: sayfa2BaslangicSatir + 1 }, ext: { width: 130, height: 70 } })
  // Logo için yer aç
  for (let i = 0; i < 4; i++) ws.addRow([])

  let row = ws.addRow(['', 'Fiyat Teklifi'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).font = { size: 24, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 36

  ws.addRow([])

  row = ws.addRow(['', `Sayın ${teklif.firmaAdi || ''}`])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).font = { bold: true, size: 12 }

  row = ws.addRow(['', TRASSIR_KARSILAMA])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  row.height = 110

  ws.addRow([])

  row = ws.addRow(['', 'ZNA Hakkında'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).border = { bottom: { style: 'medium', color: { argb: 'FF0176D3' } } }

  row = ws.addRow(['', ZNA_HAKKINDA])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  row.height = 130

  ws.addRow([])

  row = ws.addRow(['', 'Hizmetlerimiz'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).border = { bottom: { style: 'medium', color: { argb: 'FF0176D3' } } }

  HIZMETLERIMIZ.forEach(h => {
    const r = ws.addRow(['', `•  ${h}`])
    ws.mergeCells(`B${r.number}:${sonSutun}${r.number}`)
  })
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 3 — Fiyatlandırma  ===========
  const sayfa3BaslangicSatir = ws.lastRow ? ws.lastRow.number : 0
  ws.addImage(znaLogoId, { tl: { col: 0, row: sayfa3BaslangicSatir + 1 }, ext: { width: 130, height: 70 } })
  for (let i = 0; i < 4; i++) ws.addRow([])

  row = ws.addRow(['', `Tarih : ${fmtTarih(teklif.tarih)}`, '', '', '', `Hazırlayan : ${teklif.hazirlayan || '—'}`])
  row.getCell(2).font = { bold: true }
  row.getCell(6).font = { bold: true }

  ws.addRow([])
  row = ws.addRow(['', 'Fiyatlandırma'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
  row.getCell(2).font = { size: 18, bold: true, color: { argb: 'FF0176D3' } }
  row.getCell(2).alignment = { horizontal: 'center' }
  row.height = 26
  ws.addRow([])

  // Tablo başlığı
  const headerRow = ws.addRow(iskKolon
    ? ['', 'Marka', 'Açıklama', 'Ad./Mt.', 'Birim Fiyat', 'İskonto', 'Toplam Fiyat']
    : ['', 'Marka', 'Açıklama', 'Ad./Mt.', 'Birim Fiyat', 'Toplam Fiyat'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 22
  tabloKolonlari.forEach(c => {
    headerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0176D3' } }
    headerRow.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const para = (n) => `${paraSembol}${tutarMetni(n)}`
  const tutarSutun = iskKolon ? 7 : 6
  ;(teklif.satirlar || []).forEach((s, i) => {
    const hs = h.satirlar[i]
    const r = ws.addRow([
      '',
      s.marka || (s.stokKodu ? '—' : 'ZNA'),
      s.stokAdi || '',
      `${s.miktar} ${s.birim || ''}`,
      para(s.birimFiyat),
      ...(iskKolon ? [satirIskontoMetni(hs.iskontoOran)] : []),
      para(hs.net),
    ])
    if (i % 2) {
      tabloKolonlari.forEach(c => r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } })
    }
    tabloKolonlari.forEach(c => r.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })
    for (let c = 4; c <= tutarSutun; c++) r.getCell(c).alignment = { horizontal: 'right' }
    r.getCell(tutarSutun).font = { bold: true }
  })

  ws.addRow([])
  // Etiket ve tutar, fiyat tablosunun son iki sütununa hizalanır.
  const etiketSutun = tutarSutun - 1
  const yaz = (etiket, deger, kalin = false) => {
    const hucreler = []
    hucreler[etiketSutun - 1] = etiket
    hucreler[tutarSutun - 1] = deger
    const r = ws.addRow(Array.from(hucreler, (v) => v ?? ''))
    r.getCell(etiketSutun).alignment = { horizontal: 'right' }
    r.getCell(tutarSutun).alignment = { horizontal: 'right' }
    if (kalin) {
      for (const c of [etiketSutun, tutarSutun]) {
        r.getCell(c).font = { bold: true, color: { argb: 'FF0176D3' } }
        r.getCell(c).border = { top: { style: 'medium', color: { argb: 'FF0176D3' } } }
      }
    }
  }
  if (h.satirIskontoVar) {
    yaz('Brüt Tutar :', para(h.brutToplam))
    yaz(`${iskontoEtiketi(h)} :`, `−${para(h.satirIskontoToplam)}`)
  }
  yaz('Ara Tutar :', para(h.araToplam))
  if (h.genelIskontoVar) yaz(`Genel İskonto (%${oranMetni(h.genelIskontoOran)}) :`, `−${para(h.genelIskontoTutar)}`)
  // KDV oranı satırlardan türetilir — sabit %20 varsayımı %18'li tekliflerde
  // Excel'i PDF'ten farklı tutara götürüyordu.
  for (const { etiket, tutar } of kdvSatirlari(h)) yaz(`${etiket} :`, para(tutar))
  yaz('Genel Toplam :', para(h.genelToplam), true)

  if (teklif.aciklama) {
    ws.addRow([])
    const r = ws.addRow(['', `Açıklama : ${teklif.aciklama}`])
    ws.mergeCells(`B${r.number}:${sonSutun}${r.number}`)
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    r.height = 50
  }
  ws.lastRow.addPageBreak = true

  // ===========  Sayfa 4 — İş Ortakları  ===========
  const sayfa4BaslangicSatir = ws.lastRow ? ws.lastRow.number : 0
  ws.addImage(znaLogoId, { tl: { col: 0, row: sayfa4BaslangicSatir + 1 }, ext: { width: 130, height: 70 } })
  for (let i = 0; i < 4; i++) ws.addRow([])

  row = ws.addRow(['', 'İş Ortaklarımız'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
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
  const sayfa5BaslangicSatir = ws.lastRow ? ws.lastRow.number : 0
  ws.addImage(znaLogoId, { tl: { col: 0, row: sayfa5BaslangicSatir + 1 }, ext: { width: 130, height: 70 } })
  for (let i = 0; i < 4; i++) ws.addRow([])

  row = ws.addRow(['', 'Bazı Referanslarımız'])
  ws.mergeCells(`B${row.number}:${sonSutun}${row.number}`)
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
