// Mesai Raporu erişimi — İK Yönetimi altındaki saha mesai takibi.
// Kullanıcı kararı (2026-07-27): Abdullah (İK modülü) + Ali + Oğuz + Ferdi.
//
// DB karşılığı: mesai_kayitlari SELECT politikası (mig 237) —
//   kendi kaydı | admin | ad ~ (oğuz|ali|ferdi) | ik_yetkili()
// Buradaki kural o politikanın MENÜ tarafındaki dar karşılığıdır: yalnız bu
// dört kişi raporu görür (diğer adminler menüde görmez).
import { ikGorebilirMi } from './ikYetki'

export const mesaiRaporuGorebilirMi = (kullanici) => {
  if (ikGorebilirMi(kullanici)) return true          // Ali(1), Oğuz(2), Abdullah(44)
  const ad = (kullanici?.ad || '').toLocaleLowerCase('tr')
  return /\b(ferdi)\b/.test(ad)                       // Ferdi Kalkan
}
