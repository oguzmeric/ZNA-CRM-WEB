// Teklif görünürlüğü — teknisyen / saha ekibi / depo personeli teklif ve fiyat
// GÖREMEZ (kullanıcı kararı 28.07: "teknisyenler ve saha elemanları hariç
// diğerleri görebilir", depo sorumluları da hariç).
//
// Tek anahtar: kullanicilar.moduller içindeki 'teklifler'. Personel Yönetimi >
// Modül erişimleri ekranından verilip alınır; kod değişikliği gerekmez.
//
// AYNI kural üç yerde uygulanır — üçü de bu anahtara bakar:
//   - web menü/rota  → burası (MainLayout filtresi + App.jsx TeklifGuard)
//   - mobil menü     → crm-mobile/src/services/menuYetkiService.js MODUL_ESLEME
//   - veritabanı     → migration 238, public.teklif_gorebilir() + RLS
// UI'yi gizlemek TEK BAŞINA yetmez; asıl kapı RLS'tir (PostgREST doğrudan
// sorgulanabilir). Burası sadece kullanıcıya boş/kırık ekran göstermemek için.
export function teklifGorebilirMi(kullanici) {
  if (!kullanici) return false
  // Müşteri portal hesapları bu kapıdan geçmez; kendi tekliflerini DB'deki
  // teklifler_customer_self_select politikasıyla ve portal sayfalarından görür.
  if (kullanici.tip === 'musteri') return false
  if (kullanici.rol === 'admin') return true
  return Array.isArray(kullanici.moduller) && kullanici.moduller.includes('teklifler')
}

/**
 * "Yönetici Onayı" verme ve teklif yönetici onayındayken durum değiştirme.
 *
 * Eskiden yalnız `rol === 'admin'` idi; bu, teklif yetkisini SİSTEM GENELİNDE
 * admin olmaya bağlıyordu. Abdullah İğde (44, Muhasebe müdürü) teklif tarafında
 * tam yetki alacaktı ama admin yapılması gereksiz genişlikte olurdu (tüm
 * modüller, tüm yönetim ekranları). Bunun için zaten amaca özel bir bayrak var:
 * teklif_onay_ust_yetkili. Yetki artık ROLE değil O BAYRAĞA bakıyor.
 *
 * Kapsam kontrolü: bayrak bugün Ali (1), Oğuz (2), Ahmet Agun (29) — üçü de
 * zaten admin — ve Abdullah (44). Yani kural genişlemesi yalnız Abdullah'ı
 * etkiliyor, kimsenin yetkisi daralmıyor.
 */
export function teklifYoneticiOnayiVerebilir(kullanici) {
  if (!kullanici) return false
  if (kullanici.rol === 'admin') return true
  return kullanici.teklifOnayUstYetkili === true || kullanici.teklif_onay_ust_yetkili === true
}
