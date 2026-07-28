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
