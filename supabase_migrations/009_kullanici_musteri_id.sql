-- =====================================================================
-- Müşteri portalı kullanıcılarını musteriler tablosuna doğrudan bağla
-- =====================================================================
-- Şimdiye kadar kullanicilar.firma_adi = musteriler.firma string eşleşmesi
-- ile bağlantı kuruluyordu. Yazım farkları (boşluk, büyük/küçük) sorunları
-- çıkarıyordu. Bu migration kalıcı bir FK ile değiştirir.
-- =====================================================================

-- 1. FK kolon
alter table kullanicilar
  add column if not exists musteri_id bigint
    references musteriler(id) on delete set null;

create index if not exists idx_kullanicilar_musteri_id
  on kullanicilar(musteri_id);

-- 2. Best-effort backfill — firma_adi tam eşleşenleri bağla
update kullanicilar k
   set musteri_id = m.id
  from musteriler m
 where k.tip = 'musteri'
   and k.musteri_id is null
   and k.firma_adi is not null
   and k.firma_adi = m.firma;

-- 3. current_musteri_id() fonksiyonunu güncelle — direkt FK oku
create or replace function current_musteri_id()
returns bigint language sql stable security definer set search_path = public as $$
  select musteri_id
    from kullanicilar
   where auth_id = auth.uid()
     and tip = 'musteri'
   limit 1;
$$;
