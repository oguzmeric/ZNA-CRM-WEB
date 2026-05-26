-- Servis talebi musteri degerlendirmesi — musteri kendi portal'indan yildiz + yorum verir.
-- Onceden localStorage'a yaziliyordu (tarayici-ozel, paylasilamiyordu, dogru veri degildi).

alter table servis_talepleri
  add column if not exists degerlendirme_puan smallint check (degerlendirme_puan between 1 and 5),
  add column if not exists degerlendirme_yorum text,
  add column if not exists degerlendirme_tarihi timestamptz,
  add column if not exists degerlendirme_kullanici_id bigint references kullanicilar(id);

create index if not exists idx_servis_talepleri_degerlendirme_puan
  on servis_talepleri(degerlendirme_puan) where degerlendirme_puan is not null;

-- NOT: RLS update policy'leri kullanicilar tablosunda zaten musterinin kendi
-- talebini guncellemesine izin veriyor (ornegin notlar, durum). Yeni kolonlar
-- ayni policy kapsaminda kalir, ek policy gerekmez. Eger frontend testte
-- "permission denied" alirsa bu migrasyona policy ekleyebiliriz.

-- PostgREST schema cache reload (yeni kolonlari fark etsin)
notify pgrst, 'reload schema';
