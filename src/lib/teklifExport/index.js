// Teklif Excel export — tipe göre dispatch + ortak yardımcılar.
// Lazy: exceljs ~600KB; bu modülü ancak Excel İndir butonuna basılınca yükle.

export async function teklifiExcelOlarakIndir(teklif) {
  const tip = teklif.teklifTipi || 'standart'
  const { saveAs } = await import('file-saver')

  let blob
  if (tip === 'trassir') {
    const { trassirExcelOlustur } = await import('./trassirExcel')
    blob = await trassirExcelOlustur(teklif)
  } else if (tip === 'karel') {
    const { karelExcelOlustur } = await import('./karelExcel')
    blob = await karelExcelOlustur(teklif)
  } else {
    const { standartExcelOlustur } = await import('./standartExcel')
    blob = await standartExcelOlustur(teklif)
  }

  const dosyaAdi = `Teklif_${teklif.teklifNo || teklif.id}_${tip}.xlsx`
  saveAs(blob, dosyaAdi)
}

// Yardımcı: public/teklif-assets/...'tan görseli ArrayBuffer olarak çek
export async function gorseliCek(yol) {
  const res = await fetch(yol)
  if (!res.ok) throw new Error(`Görsel yüklenemedi: ${yol} (${res.status})`)
  return await res.arrayBuffer()
}
