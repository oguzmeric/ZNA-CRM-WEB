// ZNA Filo Yönetimi grubu (Mobiltek, Araçlar, Bakım, Belgeler, Yakıt, Sürücüler)
// görünürlüğü:
//   - Yönetim erişimi olanlar (Oğuz, Ali, Ferdi — isim bazlı, eski davranış)
//   - Ahmet Agun (id 29) ve Abdullah İğde (id 44) — 2026-07-17 talebi
// NOT: Bu yetki YALNIZ filo grubunu açar; Yönetim grubu (Kullanıcılar vb.)
// ayrı kalır. MainLayout menü filtresi + App.jsx FiloGuard bu fonksiyonu kullanır.
const IZINLI_KULLANICI_IDLERI = [29, 44]

export function filoGorebilirMi(kullanici) {
  if (!kullanici) return false
  const ad = (kullanici.ad || '').toLocaleLowerCase('tr')
  if (/\b(oğuz|oguz|ali|ferdi)\b/i.test(ad)) return true
  return IZINLI_KULLANICI_IDLERI.includes(Number(kullanici.id))
}
