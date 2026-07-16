-- 177 — Servis → Proforma Fatura köprüsü
-- Servisi tamamlayan personel "Fatura Kesilecek" işaretler → fatura_talepleri'nde
-- bekleyen proforma oluşur (müşteri künyesi + servis konusu; tutar boş, muhasebe
-- keserken girer). Muhasebe: PDF + ödeme yöntemi + kesildi → adminlere bildirim.

alter table fatura_talepleri
  add column if not exists servis_talep_id bigint references servis_talepleri(id) on delete set null;

alter table servis_talepleri
  add column if not exists fatura_talep_id bigint references fatura_talepleri(id) on delete set null;

-- Aynı servise ikinci AÇIK proforma engeli (teklif tarafındaki uq desenle aynı)
create unique index if not exists uq_fatura_talep_acik_servis
  on fatura_talepleri (servis_talep_id)
  where (durum = 'bekliyor' and servis_talep_id is not null);

comment on column fatura_talepleri.servis_talep_id is 'Kaynak servis (teklif_id yerine servisten açıldıysa)';
comment on column servis_talepleri.fatura_talep_id is 'Bu servise açılan proforma fatura talebi (geri link, durum gösterimi için)';
