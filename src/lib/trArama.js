// Türkçe arama normalizasyonu — TEK kaynak.
//
// Kullanıcı "sisli" yazınca "ŞİŞLİ" bulunmalı, "guvercintepe" yazınca
// "GÜVERCİNTEPE". Aksan ve İ/I farkları aramayı bozmamalı.
//
// ⚠️ Türkçe İ/I tuzağı: `toLowerCase()` "İ"yi "i̇" (i + birleşen nokta) yapar;
// bu iki KOD BİRİMİDİR ve düz "i" ile eşleşmez. Bu yüzden önce
// `toLocaleLowerCase('tr')`, sonra o birleşik biçim tek "i"ye indirgenir.

export const trNormalize = (s = '') =>
  String(s).toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')

/** Aranan metin hedefin içinde geçiyor mu (Türkçe duyarsız) */
export const trIcerir = (hedef, aranan) => {
  const q = trNormalize(aranan).trim()
  return !q || trNormalize(hedef).includes(q)
}

/**
 * Çok kelimeli arama: "altin park" → hem "altın" hem "park" geçen kayıtlar.
 * Uzun lokasyon adlarında ("ALTINŞEHİR KÜLTÜR VE YAŞAM MERKEZİ") kullanıcı
 * araya kelime sıkıştırmadan yazamıyor; kelimeleri ayrı ayrı aramak şart.
 */
export const trKelimeEslesir = (hedef, aranan) => {
  const h = trNormalize(hedef)
  const kelimeler = trNormalize(aranan).trim().split(/\s+/).filter(Boolean)
  return kelimeler.every(k => h.includes(k))
}
