-- 117: Stok audit v2 — depo tam takipli olsun
-- 1) stok_hareketleri.kullanici_id — hareketi kim yaptı
-- 2) stok_kalemleri soft delete — silindi olarak işaretle, geri getirilebilir
-- 3) SN geçmişi için kullanici_id her hareket eklenirken yazılır

-- ─── stok_hareketleri: kim yaptı? ───
alter table stok_hareketleri
  add column if not exists kullanici_id bigint references kullanicilar(id) on delete set null;

create index if not exists stok_hareketleri_kullanici_idx
  on stok_hareketleri (kullanici_id) where kullanici_id is not null;

-- ─── stok_kalemleri: soft delete + silme detayı ───
alter table stok_kalemleri
  add column if not exists silindi boolean not null default false,
  add column if not exists silindi_zamani timestamptz,
  add column if not exists silinme_sebebi text,
  add column if not exists silinme_notu text,
  add column if not exists silen_kullanici_id bigint references kullanicilar(id) on delete set null;

create index if not exists stok_kalemleri_silindi_idx
  on stok_kalemleri (silindi) where silindi = true;

-- Aktif kalemler için mevcut UNIQUE constraint'i soft delete uyumlu yap
-- Silinen SN'lerin unique constraint'i bloğu kaldırma; sadece silindi=false için tekil
drop index if exists stok_kalemleri_seri_no_key;
create unique index if not exists stok_kalemleri_seri_no_aktif_uq
  on stok_kalemleri (seri_no) where silindi = false and seri_no is not null;

-- Barkod için de aynı
drop index if exists stok_kalemleri_barkod_key;
create unique index if not exists stok_kalemleri_barkod_aktif_uq
  on stok_kalemleri (barkod) where silindi = false and barkod is not null;

-- Bakiye özet fonksiyonu: silindi=false'ları say (frontend zaten bunu yapıyor
-- ama server-side raporlar için de temiz olsun)
-- İsterse ekleyebilirim ama şu an gerekmiyor.

notify pgrst, 'reload schema';
