// Sipariş Yönetimi (Tedarik Süreçleri > Siparişler + Kullanılan Malzemeler)
// görünürlüğü — tutar/kâr bilgisi içerdiği için dar tutulur:
//   - admin rolü
//   - Abdullah İğde (id 44, muhasebe müdürü) — faturalama için sipariş takibi
//     gerekiyor (2026-07-17 talebi)
// MainLayout menü filtresi ile App.jsx rota guard'ı BU fonksiyonu kullanır;
// yeni kişi eklerken yalnız burayı güncelle.
const IZINLI_KULLANICI_IDLERI = [44]

export function siparisYonetimiGorebilirMi(kullanici) {
  if (!kullanici) return false
  if (kullanici.rol === 'admin') return true
  return IZINLI_KULLANICI_IDLERI.includes(Number(kullanici.id))
}
