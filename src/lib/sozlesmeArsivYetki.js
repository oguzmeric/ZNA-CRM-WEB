// Sözleşme Arşivi erişimi — MainLayout menü filtresi (sadeceSozlesmeArsiv) ve
// App.jsx SozlesmeArsivGuard AYNI kaynağı kullanır.
//
// Neden ayrı bir kapı: /sozlesmeler sayfası YonetimGuard ile korunuyor ve o kapı
// yalnız Oğuz/Ali/Ferdi'yi geçiriyor. Muhasebe müdürü (Abdullah İğde, id 44,
// rol='personel') oradan giremez — ama imzalı sözleşmeleri arşivleyecek kişi o.
// Arşiv ekranı sözleşme METNİNİ düzenlemez, silmez, tutar değiştirmez; yalnız
// listeler + imzalı PDF alır. Bu yüzden fatura/muhasebe yetkisi yeterli sayıldı.
//
// Kim girer:
//   • fatura yetkilisi   → Abdullah İğde (44), Ahmet Agun (29)  [faturaYetkisi]
//   • rol='admin'                                              [faturaYetkisi]
//   • Oğuz / Ali / Ferdi → YonetimGuard ile aynı isim listesi
import { faturaYetkisi } from '../services/faturaTalepService'

export const sozlesmeArsiviGorebilirMi = (kullanici) => {
  if (faturaYetkisi(kullanici)) return true
  return sozlesmeFormunaGirebilirMi(kullanici)
}

// /sozlesmeler ve /sozlesmeler/satis/:id rotaları YonetimGuard'a tabi. Arşivden
// oraya link verirken kullanıcının gerçekten girebileceğini bilmek gerekir —
// yoksa tıklayan kişi sessizce /dashboard'a atılır ve "buton çalışmıyor" der.
export const sozlesmeFormunaGirebilirMi = (kullanici) =>
  /\b(oğuz|oguz|ali|ferdi)\b/.test((kullanici?.ad || '').toLocaleLowerCase('tr'))
