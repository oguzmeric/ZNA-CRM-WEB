-- 186: Bir tekliften yalnız BİR aktif satış sözleşmesi (iptal edilen sayılmaz).
-- UI kilidi tek başına yetmez (çift sekme / yarış) — asıl garanti DB'de.
create unique index if not exists uq_satis_sozlesme_aktif_teklif
  on satis_sozlesmeleri (teklif_id)
  where teklif_id is not null and durum <> 'iptal';
