// Türkçe-duyarlı, büyük/küçük harf ve aksan duyarsız metin normalizasyonu.
// Arama ve karşılaştırmalarda kullanılır.
//
//   trNormalize('İstanbul') === trNormalize('istanbul')   // true
//   trNormalize('Başakşehir Elit Garden').includes(trNormalize('elitgarden'))  // true (boşluksuz eşleşmek için ek)
//
// Basit: lowercase + Türkçe-özel karakterleri ASCII'ye çevirir.
export const trNormalize = (s = '') =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

// Birden çok alanı tek string'de arar. Tokenize etmeden ortak substring arar,
// ayrıca boşluk duyarsız alternatif: "elitgarden" → "elit garden" bulunur.
export const trContains = (metin, sorgu) => {
  const s = trNormalize(sorgu).trim()
  if (!s) return true
  const m = trNormalize(metin)
  if (m.includes(s)) return true
  // boşluksuz arama: arama içindeki boşlukları kaldırıp metinle karşılaştır
  const mNoSpace = m.replace(/\s+/g, '')
  const sNoSpace = s.replace(/\s+/g, '')
  return mNoSpace.includes(sNoSpace)
}
