// HEIC'i GÖRÜNTÜLERKEN çevirme — tarihi kayıtlar için köprü (17.08.2026).
//
// Teknisyenler ağırlıklı iPhone kullanıyor; 04.08 öncesi mobil yüklemelerde
// galeriden seçilen fotolar HEIC düştü (fotoSec.js o gün kuruldu, yenileri
// JPEG geliyor). Tarayıcı HEIC çizemediği için eski kayıtların fotoğrafları
// ekranda ve PDF çıktısında boş kalıyordu (TB-2026-00029: 6 fotonun 5'i).
//
// Bu modül dosyayı YERİNDE DEĞİŞTİRMEZ: indirir, tarayıcıda JPEG'e çevirir,
// objectURL verir. Yetki gerektirmez, geri alınabilir — Storage'daki HEIC'ler
// kalıcı onarılırsa bu köprü sökülür.
//
// Keşif dersleri aynen geçerli (KesifFotoBolumu):
// - heic2any DEĞİL heic-to (güncel libheif; eskisi yeni iPhone HEIC'i tanımaz)
// - tembel import — ~750kB chunk ana pakete girmesin
// - Promise.race + 90sn — CSP worker'ı engellerse promise SONSUZA DEK askıda
//   kalır ("sonsuz Çevriliyor…" dersi); worker-src 'self' blob: vercel.json'da.

const _cache = new Map()   // url -> Promise<objectURL|null>; oturum boyu yaşar,
                           // revoke edilmez (detay+yazdır gezinmesinde tek dönüşüm)

export const heicMi = (url = '') =>
  /\.hei[cf]($|\?)/i.test(String(url))

export const heicNesneUrlGetir = (url) => {
  if (!_cache.has(url)) {
    _cache.set(url, (async () => {
      try {
        const yanit = await fetch(url)
        if (!yanit.ok) throw new Error('indirilemedi ' + yanit.status)
        const kaynak = await yanit.blob()
        const { heicTo } = await import('heic-to')
        const jpeg = await Promise.race([
          heicTo({ blob: kaynak, type: 'image/jpeg', quality: 0.85 }),
          new Promise((_, red) => setTimeout(() => red(new Error('90sn doldu')), 90000)),
        ])
        return URL.createObjectURL(jpeg)
      } catch {
        _cache.delete(url)   // geçici hata (ağ vb.) sonraki denemeyi kilitlemesin
        return null
      }
    })())
  }
  return _cache.get(url)
}
