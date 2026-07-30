-- 248: İmzalanmış satış sözleşmesinde REVİZYON.
--
-- İhtiyaç: bir proje imzalandıktan sonra yeni iş (yeni teklif) çıkabiliyor.
-- Şimdiye kadar imzalı sözleşmede "Kilidi Aç" butonu bile yoktu — çıkmaz sokaktı.
--
-- Kilidi açmak imzalı belgeyi TAHRİP ETMEMELİ: eski imzalı PDF ve imza tarihi
-- imza_gecmisi'ne taşınır, revizyon_no artar, yeni imza istenir. Böylece
-- "müşteri hangi metni imzalamıştı?" sorusu her zaman cevaplanabilir.

alter table public.satis_sozlesmeleri
  add column if not exists revizyon_no integer not null default 0,
  add column if not exists imza_gecmisi jsonb not null default '[]'::jsonb;

comment on column public.satis_sozlesmeleri.revizyon_no is
  'İmzadan sonra kaç kez kilidi açılıp revize edildi. 0 = hiç revize edilmedi.';
comment on column public.satis_sozlesmeleri.imza_gecmisi is
  'Önceki imzalı sürümler: [{revizyon, imzaliPdfUrl, imzaliPdfAd, imzaTarihi, nihaiToplam, teklifNo, acanId, acanAd, acmaTarihi, sebep}]';

notify pgrst, 'reload schema';
