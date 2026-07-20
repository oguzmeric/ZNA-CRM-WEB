// İK (bordro + izin yönetimi) erişimi — MainLayout menü filtresi ve App.jsx
// IKGuard AYNI kaynağı kullanır. DB tarafı karşılığı: public.ik_yetkili() (mig 205).
// SADECE 'ik_yonetim' modülü olanlar: Ali (1), Oğuz (2), Abdullah (44) —
// admin rolü BYPASS EDEMEZ (kullanıcı kararı, 2026-07-20). Yeni kişi =
// Kullanıcı Yönetimi'nden modül ver.
export const ikGorebilirMi = (kullanici) =>
  (kullanici?.moduller || []).includes('ik_yonetim')
