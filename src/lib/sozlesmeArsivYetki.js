// Sözleşme Arşivi erişimi — MainLayout menü filtresi (sadeceSozlesmeArsiv) ve
// App.jsx SozlesmeArsivGuard AYNI kaynağı kullanır.
//
// SADECE Abdullah İğde (id 44, Muhasebe müdürü) — kullanıcı kararı, 30.07.2026.
// Gerekçe: sözleşmeler zaten /sozlesmeler'de listeleniyor; oraya girebilen
// (Oğuz/Ali/Ferdi) için arşiv aynı kayıtların ikinci bir görünümü olurdu.
// Abdullah ise YonetimGuard'dan geçemediği için /sozlesmeler'i göremiyor —
// arşiv onun TEK penceresi. Böylece kimse aynı listeyi iki yerde görmüyor.
//
// Admin rolü BYPASS EDEMEZ (İK modülüyle aynı desen: [[ikGorebilirMi]]).
// Yeni kişiye açılacaksa buraya id eklenir.
const ARSIV_YETKILILERI = [44]

export const sozlesmeArsiviGorebilirMi = (kullanici) =>
  ARSIV_YETKILILERI.includes(Number(kullanici?.id))

// /sozlesmeler ve /sozlesmeler/satis/:id rotaları YonetimGuard'a tabi. Arşivden
// oraya link verirken kullanıcının gerçekten girebileceğini bilmek gerekir —
// yoksa tıklayan kişi sessizce /dashboard'a atılır ve "buton çalışmıyor" der.
// (Abdullah için false döner; arşivde satış sözleşmesi "Aç" butonu çıkmaz.)
export const sozlesmeFormunaGirebilirMi = (kullanici) =>
  /\b(oğuz|oguz|ali|ferdi)\b/.test((kullanici?.ad || '').toLocaleLowerCase('tr'))
