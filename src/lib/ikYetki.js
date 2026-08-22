// İK (bordro + izin yönetimi) erişimi — MainLayout menü filtresi ve App.jsx
// IKGuard AYNI kaynağı kullanır. DB tarafı karşılığı: public.ik_yetkili() (mig 205).
// SADECE 'ik_yonetim' modülü olanlar: Ali (1), Oğuz (2), Abdullah (44) —
// admin rolü BYPASS EDEMEZ (kullanıcı kararı, 2026-07-20). Yeni kişi =
// Kullanıcı Yönetimi'nden modül ver.
export const ikGorebilirMi = (kullanici) =>
  (kullanici?.moduller || []).includes('ik_yonetim')

// BORDRO & MAAŞ — İK'nın en dar kapısı (22.08 kullanıcı kararı: "burası çok kritik").
// SADECE 'bordro_yonetim' modülü: Ali (1), Oğuz (2). admin rolü BYPASS EDEMEZ
// (Ferdi/Ahmet admin ama bordro göremez). DB karşılığı: public.bordro_yetkili() (mig 324).
// ⚠️ Personelin KENDİ bordrosu bu kapıdan geçmez — /izin-bordro > Bordrolarım herkese açıktır.
export const bordroGorebilirMi = (kullanici) =>
  (kullanici?.moduller || []).includes('bordro_yonetim')
