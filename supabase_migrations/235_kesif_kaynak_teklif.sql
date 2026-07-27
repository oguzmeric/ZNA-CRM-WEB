-- 235 — Keşfe kaynak olan ÖNCEKİ teklif bağlantısı.
--
-- Not: kesifler.teklif_id zaten var ama TERS yönü tutuyor (keşiften ÜRETİLEN
-- teklif). Daha önce teklif verilmiş bir yere sonradan keşfe gidildiğinde,
-- o eski teklifin kalemleri fiyatsız olarak keşfe aktarılabilsin diye ayrı
-- bir kaynak alanı gerekiyor.
alter table public.kesifler
  add column if not exists kaynak_teklif_id bigint references public.teklifler(id) on delete set null,
  add column if not exists kaynak_teklif_no text;

comment on column public.kesifler.kaynak_teklif_id is
  'Keşfe kalem aktarılan önceki teklif (girdi). teklif_id ise keşiften üretilen tekliftir (çıktı).';

create index if not exists kesifler_kaynak_teklif_idx
  on public.kesifler (kaynak_teklif_id) where kaynak_teklif_id is not null;
