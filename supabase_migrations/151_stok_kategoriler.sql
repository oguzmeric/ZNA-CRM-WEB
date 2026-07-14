-- 151: Stok v2 Faz 1 — Hiyerarşik kategori ağacı + ürün kartı yeni alanlar
-- Kaynak: "Stok ve Malzeme Kartları Modülü" spec (2026-07-14).
-- Kategori düz grup_kodu yerine ağaç yapılı stok_kategoriler tablosuna taşınır.
-- Ürün kartına ticari/teknik alanlar eklenir (tedarikçi, ürün tipi, garanti...).

-- ==================== KATEGORİ AĞACI ====================
create table if not exists stok_kategoriler (
  id bigint generated always as identity primary key,
  ad text not null,
  ust_id bigint references stok_kategoriler(id) on delete restrict,
  sira int not null default 0,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now()
);

-- Aynı üst altında aynı ad iki kez olmasın (kök için ust_id null → 0 sayılır)
create unique index if not exists ux_stok_kategori_ad
  on stok_kategoriler (coalesce(ust_id, 0), lower(trim(ad)));
create index if not exists ix_stok_kategori_ust on stok_kategoriler (ust_id);

-- RLS: okuma personel, yazma yalnız admin (spec: "yönetici tarafından eklenebilmeli")
alter table stok_kategoriler enable row level security;
drop policy if exists stok_kategori_sel on stok_kategoriler;
create policy stok_kategori_sel on stok_kategoriler
  for select using (is_staff());
drop policy if exists stok_kategori_ins on stok_kategoriler;
create policy stok_kategori_ins on stok_kategoriler
  for insert with check (is_admin());
drop policy if exists stok_kategori_upd on stok_kategoriler;
create policy stok_kategori_upd on stok_kategoriler
  for update using (is_admin()) with check (is_admin());
drop policy if exists stok_kategori_del on stok_kategoriler;
create policy stok_kategori_del on stok_kategoriler
  for delete using (is_admin());

-- Seed: spec'teki kategori ağacı — yalnız tablo boşken (idempotent)
do $$
declare
  v_guv bigint; v_kam bigint; v_kay bigint; v_aks bigint;
  v_net bigint; v_gec bigint; v_kab bigint;
begin
  if exists (select 1 from stok_kategoriler limit 1) then
    return;
  end if;

  insert into stok_kategoriler (ad, sira) values ('Güvenlik Sistemleri', 1) returning id into v_guv;
  insert into stok_kategoriler (ad, ust_id, sira) values ('Kamera Sistemleri', v_guv, 1) returning id into v_kam;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('IP Kamera', v_kam, 1), ('Analog Kamera', v_kam, 2),
    ('Termal Kamera', v_kam, 3), ('PTZ Kamera', v_kam, 4);
  insert into stok_kategoriler (ad, ust_id, sira) values ('Kayıt Sistemleri', v_guv, 2) returning id into v_kay;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('NVR', v_kay, 1), ('DVR', v_kay, 2), ('Sunucu', v_kay, 3);
  insert into stok_kategoriler (ad, ust_id, sira) values ('Kamera Aksesuarları', v_guv, 3) returning id into v_aks;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('Kamera Ayağı', v_aks, 1), ('Buat', v_aks, 2), ('Adaptör', v_aks, 3), ('Lens', v_aks, 4);

  insert into stok_kategoriler (ad, sira) values ('Network Sistemleri', 2) returning id into v_net;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('Network Switch', v_net, 1), ('PoE Switch', v_net, 2),
    ('Access Point', v_net, 3), ('Router', v_net, 4);

  insert into stok_kategoriler (ad, sira) values ('Geçiş Kontrol Sistemleri', 3) returning id into v_gec;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('Kartlı Geçiş', v_gec, 1), ('Turnike', v_gec, 2),
    ('Bariyer', v_gec, 3), ('Plaka Tanıma', v_gec, 4);

  insert into stok_kategoriler (ad, sira) values ('Kablolama', 4) returning id into v_kab;
  insert into stok_kategoriler (ad, ust_id, sira) values
    ('Data Kablosu', v_kab, 1), ('Fiber Kablo', v_kab, 2),
    ('Enerji Kablosu', v_kab, 3), ('Patch Cord', v_kab, 4);

  insert into stok_kategoriler (ad, sira) values
    ('Yangın Sistemleri', 5), ('Telekomünikasyon Sistemleri', 6), ('Sarf Malzemeleri', 7);
end $$;

-- ==================== ÜRÜN KARTI YENİ ALANLAR ====================
alter table stok_urunler add column if not exists kategori_id bigint references stok_kategoriler(id) on delete set null;
alter table stok_urunler add column if not exists urun_tipi text not null default 'stoklu'
  check (urun_tipi in ('stoklu','stoksuz','sarf','hizmet','demirbas'));
alter table stok_urunler add column if not exists barkod text;              -- ürün seviyesi barkod (SN'den bağımsız)
alter table stok_urunler add column if not exists tedarikci text;
alter table stok_urunler add column if not exists tedarikci_urun_kodu text;
alter table stok_urunler add column if not exists garanti_suresi_ay int;    -- ay cinsinden
alter table stok_urunler add column if not exists para_birimi text not null default 'TRY'
  check (para_birimi in ('TRY','USD','EUR'));
alter table stok_urunler add column if not exists aktif boolean not null default true;
alter table stok_urunler add column if not exists dokuman_url text;         -- teknik doküman (datasheet) storage path
alter table stok_urunler add column if not exists dokuman_ad text;          -- orijinal dosya adı

create index if not exists ix_stok_urun_kategori on stok_urunler (kategori_id);
create index if not exists ix_stok_urun_aktif on stok_urunler (aktif) where aktif = false;

-- Backfill: grup_kodu dolu olan 2 kayıt (canlı sayım 2026-07-14: Kamera=1, KABLO=1)
update stok_urunler u set kategori_id = k.id
from stok_kategoriler k
where u.kategori_id is null
  and lower(trim(u.grup_kodu)) = 'kamera'
  and k.ad = 'Kamera Sistemleri';
update stok_urunler u set kategori_id = k.id
from stok_kategoriler k
where u.kategori_id is null
  and lower(trim(u.grup_kodu)) = 'kablo'
  and k.ad = 'Kablolama';

-- ==================== TEKNİK DOKÜMAN BUCKET ====================
insert into storage.buckets (id, name, public)
values ('urun-dokuman', 'urun-dokuman', false)
on conflict do nothing;

drop policy if exists urun_dokuman_sel on storage.objects;
create policy urun_dokuman_sel on storage.objects for select
  using (bucket_id = 'urun-dokuman' and is_staff());
drop policy if exists urun_dokuman_ins on storage.objects;
create policy urun_dokuman_ins on storage.objects for insert
  with check (bucket_id = 'urun-dokuman' and is_staff());
drop policy if exists urun_dokuman_del on storage.objects;
create policy urun_dokuman_del on storage.objects for delete
  using (bucket_id = 'urun-dokuman' and is_staff());

notify pgrst, 'reload schema';
