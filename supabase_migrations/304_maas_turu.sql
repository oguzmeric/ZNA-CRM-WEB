-- 304 — personel_maaslari.maas_turu: brüt YANINDA net maaşla da hesap
-- (17.08 kullanıcı isteği: "Net üzerinden de hesaplama yapabilir misin?")
--
-- Formül DEĞİŞMEZ (tutar ÷ bölen × katsayı) — yalnız hangi tutarın
-- kullanıldığı işaretlenir; sonuç girilen türün cinsindendir. Brüt↔net
-- VERGİ DÖNÜŞÜMÜ YAPILMAZ (dilime göre değişir, yanlış üretir).
-- Mevcut kayıtlar 'brut' kalır (bugüne kadarki girişler brüt varsayımıyla).

begin;

alter table public.personel_maaslari
  add column if not exists maas_turu text not null default 'brut'
  check (maas_turu in ('brut', 'net'));

comment on column public.personel_maaslari.maas_turu is
  'brut|net — hesap girilen türün cinsinden yapılır, vergi dönüşümü yok (mig 304)';

commit;
