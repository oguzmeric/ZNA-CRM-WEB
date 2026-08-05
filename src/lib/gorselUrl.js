// Supabase Storage görsel küçültme yardımcısı.
//
// Saha fotoğrafları telefondan olduğu gibi yükleniyor: tek kare 3-6 MB.
// Servis formu çıktısında bunlar 190px'lik kutularda gösteriliyor ama tarayıcı
// ORİJİNALİ indiriyordu — 8 fotoğraflık bir talepte 25 MB, önizleme ~1 dakika.
//
// Ölçüm (talep 183, 6,1 MB'lık kare):
//   object/public         → 6.375.748 B
//   render/image ?w=900   →   603.584 B   (%90,5 küçük)
//
// Not: yalnız Supabase public object URL'leri dönüştürülür. Data URL (imzalar),
// yerel asset (banner) ve dış bağlantılar olduğu gibi geri döner.

const PUBLIC_KALIP = /^(.*)\/storage\/v1\/object\/public\/(.+)$/

/**
 * @param {string} url  Supabase public object URL'si
 * @param {object} [ayar]
 * @param {number} [ayar.genislik=900]  px. A4'te ~90mm'ye basılınca ≈250 DPI.
 * @param {number} [ayar.kalite=75]     1-100
 */
export const kucukGorsel = (url, { genislik = 900, kalite = 75 } = {}) => {
  const s = String(url || '')
  const m = s.match(PUBLIC_KALIP)
  if (!m) return url
  const [, kok, yolVeSorgu] = m
  // Dosya yolunda zaten query varsa (imzalı/parametreli) dokunma — bozmayalım
  if (yolVeSorgu.includes('?')) return url
  return `${kok}/storage/v1/render/image/public/${yolVeSorgu}?width=${genislik}&quality=${kalite}`
}
