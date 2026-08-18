-- 307: musteri_cihazlari.seri_no NULL olabilir (18.08.2026)
-- SN opsiyonel yapildi (web 37ea333 + mobil cb1db4f: barkodsuz urun) ama kolon
-- NOT NULL kalmisti — kayit "null value in column seri_no" ile patliyordu.
-- Unique index ux_musteri_cihaz_sn upper(trim(seri_no)) ifadeli: NULL index'e
-- girmez, SN'siz kayitlar cakismaz (istemci toDb '' -> null cevirir, bos
-- string DB'ye hic ulasmaz).
alter table public.musteri_cihazlari alter column seri_no drop not null;

notify pgrst, 'reload schema';
