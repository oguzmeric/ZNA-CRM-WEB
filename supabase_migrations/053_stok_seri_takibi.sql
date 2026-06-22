-- Migration 053: Stok seri numarası takibi
-- seri_takipli: ürün seri-takipli mi (kamera/sunucu vb.)
-- beklenen_adet: depocunun hedef adedi (stok_miktari trigger-türevli olduğu için ayrı)
-- Tekil seri index: aynı seri iki kez girilmesin (boşlar hariç)

alter table stok_urunler add column if not exists seri_takipli boolean default false;
alter table stok_urunler add column if not exists beklenen_adet integer;

-- Not 1: seri_no tekilliği zaten mevcut non-partial unique index
-- "stok_kalemleri_seri_no_key" (seri_no) tarafından sağlanıyor. Ayrı bir partial
-- index gerekmez (eklenmiş olan stok_kalemleri_seri_no_uq gereksizdi, kaldırıldı).
-- Not 2: stok_kalemleri'nde zaten "stok_kalemleri_staff_all" (FOR ALL, is_staff())
-- politikası var; INSERT bununla kapsanıyor. Ayrı insert politikası gerekmez.

notify pgrst, 'reload schema';
