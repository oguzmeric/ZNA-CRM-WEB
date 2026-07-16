-- 182 — Sipariş → Proforma Fatura köprüsü (madde 23)
--
-- Müşteri sipariş veriyor, faturayı SONRADAN kestiriyor. Şu ana kadar sipariş
-- ile fatura arasında hiçbir bağ yoktu — hangi siparişin faturası kesildi
-- görülemiyordu. mig 177'deki servis köprüsü deseniyle birebir:
--   fatura_talepleri.siparis_id  (kaynak sipariş)
--   siparisler.fatura_talep_id   (geri-link, rozet/liste için)
-- "Kullanılan Malzemeler" ekranı bu bağ üzerinden Faturalandı/Faturalanmadı gösterir.

alter table fatura_talepleri
  add column if not exists siparis_id bigint references siparisler(id) on delete set null;

alter table siparisler
  add column if not exists fatura_talep_id bigint references fatura_talepleri(id) on delete set null;

-- Aynı siparişe ikinci AÇIK proforma engeli (servis/teklif uq desenleriyle aynı)
create unique index if not exists uq_fatura_talep_acik_siparis
  on fatura_talepleri (siparis_id)
  where (durum = 'bekliyor' and siparis_id is not null);

create index if not exists idx_fatura_talep_siparis on fatura_talepleri (siparis_id);

comment on column fatura_talepleri.siparis_id is 'Kaynak sipariş (teklif/servis yerine siparişten açıldıysa)';
comment on column siparisler.fatura_talep_id is 'Bu siparişe açılan proforma fatura talebi (geri link, durum gösterimi)';

notify pgrst, 'reload schema';
