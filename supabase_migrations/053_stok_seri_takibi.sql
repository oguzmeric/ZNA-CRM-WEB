-- Migration 053: Stok seri numarası takibi
-- seri_takipli: ürün seri-takipli mi (kamera/sunucu vb.)
-- beklenen_adet: depocunun hedef adedi (stok_miktari trigger-türevli olduğu için ayrı)
-- Tekil seri index: aynı seri iki kez girilmesin (boşlar hariç)

alter table stok_urunler add column if not exists seri_takipli boolean default false;
alter table stok_urunler add column if not exists beklenen_adet integer;

create unique index if not exists stok_kalemleri_seri_no_uq
  on stok_kalemleri (seri_no) where seri_no is not null and seri_no <> '';

drop policy if exists stok_kalemleri_insert on stok_kalemleri;
create policy stok_kalemleri_insert on stok_kalemleri
  for insert to authenticated with check (is_staff());

notify pgrst, 'reload schema';
