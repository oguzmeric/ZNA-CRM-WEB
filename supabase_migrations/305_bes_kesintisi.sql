-- 305 — BES kesintisi (17.08 kullanıcı isteği: "BES'leri de oraya girmemiz
-- gerekebilir")
--
-- KARARLAR (kullanıcı seçti):
--  · Hakedişten KESİNTİ olarak düşer → "Ödenecek = maaş + mesai − BES"
--  · Tutar = maaşın YÜZDESİ; tek oran ayarlardan (varsayılan %3, otomatik
--    katılım standardı), kişi bazında kapatılabilir (cayma hakkı).
-- Taban: (maaş + mesai) × oran — otomatik katılım prime esas kazanç
-- üzerinden kesilir, fazla mesai buna DAHİLDİR.
-- bes_dahil maaş kaydında taşınır: cayma/katılım da zam gibi yeni kayıtla
-- versiyonlanır, geçmiş dönem raporu değişmez.

begin;

alter table public.ik_puantaj_ayarlar
  add column if not exists bes_orani numeric(5,2) not null default 3
  check (bes_orani >= 0);

comment on column public.ik_puantaj_ayarlar.bes_orani is
  'BES kesinti yüzdesi; (maaş+mesai)×oran hakedişten düşer. 0 = kesinti kapalı (mig 305)';

alter table public.personel_maaslari
  add column if not exists bes_dahil boolean not null default true;

comment on column public.personel_maaslari.bes_dahil is
  'false = bu kişi BES''ten caymış, kesinti uygulanmaz (mig 305)';

commit;
