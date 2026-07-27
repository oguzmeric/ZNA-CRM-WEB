-- 236 — Keşfi müşterinin ALT LOKASYON kaydına bağla.
--
-- Sorun: kesifler.lokasyon serbest metin. Sahada adres ya da farklı yazım
-- giriliyor ("DENEYİM MERKEZİ KAYAŞEHİR KAPALI PAZAR" ↔ lokasyon kaydı
-- "KAYAŞEHİR DENEYİM"), bu yüzden müşteri detayındaki lokasyon dökümünde
-- keşifler hiç eşleşmiyordu. Metin alanı korunuyor (geçmiş veri + serbest
-- giriş bozulmasın); yanına gerçek bağ ekleniyor.
alter table public.kesifler
  add column if not exists lokasyon_id bigint
    references public.musteri_lokasyonlari(id) on delete set null;

comment on column public.kesifler.lokasyon_id is
  'Müşterinin alt lokasyon kaydı. NULL ise lokasyon serbest metin (kesifler.lokasyon) olarak kalır.';

create index if not exists kesifler_lokasyon_id_idx
  on public.kesifler (lokasyon_id) where lokasyon_id is not null;
