-- 215 — Servis talebinde "Kullanılacak Malzemeler (İç Not)" alanı
--
-- İSTEK (2026-07-21): Servis talebi açılırken müşteride kullanılacak
-- malzemeler için İÇ NOT alanı. Teknisyen servis detayında bu listeyi görüp
-- envanterine ilgili ürünleri alır. Açıklama (aciklama) müşteri servis formuna
-- yansır; bu alan İÇ kalır — yalnız personel/teknisyen görür (müşteri çıktısında
-- görünmez).

alter table servis_talepleri
  add column if not exists kullanilacak_malzemeler text;

comment on column servis_talepleri.kullanilacak_malzemeler is
  'İç not — teknisyenin envanterine alacağı malzemeler; müşteri servis formunda görünmez';

notify pgrst, 'reload schema';
select 'MIG 215 OK — servis_talepleri.kullanilacak_malzemeler' as sonuc;
