// Teklif dosya adı: "{Firma Adı} - {Konu}.{uzanti}"
// Firma ya da konu boşsa teklif numarasına fallback.
// Dosya sistemi için geçersiz karakterler (/ \ : * ? " < > |) temizlenir.

const gecersizler = /[\\/:*?"<>|\r\n\t]+/g

const temizle = (metin) => {
  if (!metin) return ''
  return String(metin)
    .replace(gecersizler, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) // aşırı uzun ada karşı sınır
}

export function teklifDosyaAdi(teklif, uzanti = 'pdf') {
  const firma = temizle(teklif?.firmaAdi)
  const konu = temizle(teklif?.konu)
  let ad
  if (firma && konu) ad = `${firma} - ${konu}`
  else if (firma) ad = firma
  else if (konu) ad = konu
  else ad = `Teklif_${teklif?.teklifNo || teklif?.id || 'yeni'}`
  return `${ad}.${uzanti}`
}
