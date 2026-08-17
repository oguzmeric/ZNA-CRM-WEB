// Liste sayfa numarasının SAF çekirdeği — `useUrlSayfa` bunu kullanır.
//
// Ayrı dosyada olmasının sebebi: hook React + react-router'a bağlı, bu yüzden
// tarayıcısız test edilemiyordu. Çekirdek buraya alınınca
// `node scripts/test-url-sayfa.mjs` ile doğrudan sınanabiliyor.
//
// 🔴 BU DOSYA BİR REGRESYONDAN DOĞDU (17.08.2026):
// `useUrlSayfa` yalnız düz sayı işliyordu. Çağıranların yarısı ise React'in
// olağan `setSayfa(s => s + 1)` biçimini kullanıyordu. Fonksiyon gelince
// `Number(fn)` NaN veriyor, `NaN <= 1` false kalıyor ve URL'e fonksiyonun
// KAYNAK KODU yazılıyordu:  ?sayfa=e%3D%3EMath.min%28%24%2Ce%2B1%29
// Geri okunurken parseInt yine NaN döndürdüğü için sayfa hep 1'de kalıyordu —
// ALTI ekranda "Sonraki" düğmesi sessizce ölmüştü (07.08'de sayfa kalıcılığı
// useState yerine hook'a geçirilirken; çağıran taraf taranmamıştı).

/** URL'den okunan ham değeri geçerli sayfa numarasına çevirir (en az 1). */
export const sayfaOku = (ham) => Math.max(1, parseInt(ham || '1', 10) || 1)

/**
 * setSayfa'ya verilen değeri yazılacak sayfa numarasına çevirir.
 * React'in setState sözleşmesi: düz değer VEYA `(önceki) => yeni` fonksiyonu.
 *
 * @param {number} mevcut  şu anki sayfa (URL'den okunmuş)
 * @param {number|function} n  yeni değer ya da güncelleyici
 * @returns {number} en az 1 olan tam sayı; anlamsız girdide `mevcut` korunur
 */
export const sayfaHesapla = (mevcut, n) => {
  const taban = sayfaOku(mevcut)
  let ham
  try {
    ham = typeof n === 'function' ? n(taban) : n
  } catch {
    return taban            // güncelleyici patlarsa sayfa kaymaz
  }
  const sayi = Math.trunc(Number(ham))
  if (!Number.isFinite(sayi)) return taban   // NaN / Infinity → mevcut korunur
  return Math.max(1, sayi)
}
