// Teklif Excel export — tipe göre dispatch + ortak yardımcılar.
// Lazy: exceljs ~600KB; bu modülü ancak Excel İndir butonuna basılınca yükle.

import { teklifDosyaAdi } from '../teklifDosyaAdi'
import { dosyayiKaydet } from '../dosyaIndir'

export async function teklifiExcelOlarakIndir(teklif) {
  const tip = teklif.teklifTipi || 'standart'

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

  await dosyayiKaydet(blob, teklifDosyaAdi(teklif, 'xlsx'))
}

// Yardımcı: public/teklif-assets/...'tan görseli ArrayBuffer olarak çek
export async function gorseliCek(yol) {
  const res = await fetch(yol)
  if (!res.ok) throw new Error(`Görsel yüklenemedi: ${yol} (${res.status})`)
  return await res.arrayBuffer()
}
