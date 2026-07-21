-- 219 — Servis talebinde ÇOKLU kategori (2026-07-21 talebi:
-- "sadece bir kategori seçebiliyoruz, çoklu kategoride seçebilmeliyiz").
--
-- Mevcut alt_kategori (text) tek kategori. Geriye uyum için KORUNUR — birincil
-- kategori olarak (dizinin ilk elemanı; form çıktısı/liste/eski sorgular bunu
-- kullanmaya devam eder). Yeni alt_kategoriler (text[]) tüm seçili kategorileri
-- tutar. UI alt_kategoriler'i okur (boşsa [alt_kategori] fallback).

alter table servis_talepleri
  add column if not exists alt_kategoriler text[] not null default '{}';

-- Backfill: mevcut tekli alt_kategori'yi diziye taşı (boş/null hariç)
update servis_talepleri
   set alt_kategoriler = array[alt_kategori]
 where (alt_kategoriler is null or alt_kategoriler = '{}')
   and alt_kategori is not null and alt_kategori <> '';

notify pgrst, 'reload schema';
select 'MIG 219 OK — servis_talepleri.alt_kategoriler (text[])' as sonuc;
