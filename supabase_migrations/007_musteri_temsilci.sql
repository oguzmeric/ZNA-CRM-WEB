-- =====================================================================
-- Müşteri temsilcisi — her müşteriye bir personel ataması
-- =====================================================================
-- Müşteri portalı dashboard'ında "Temsilciniz" kutusu burayı gösterir.
-- Atama admin/personel tarafından MusteriDetay sayfasından yapılır.
-- =====================================================================

-- 1. Kolon
alter table musteriler
  add column if not exists temsilci_kullanici_id bigint
    references kullanicilar(id) on delete set null;

create index if not exists idx_musteriler_temsilci
  on musteriler(temsilci_kullanici_id);

-- 2. Müşteri RLS — kendi temsilcisinin kullanicilar kaydını okuyabilsin
-- (mevcut kullanicilar_self_select sadece kendisini/admin'i görmesine izin verir)
drop policy if exists "kullanicilar_customer_temsilci_read" on kullanicilar;
create policy "kullanicilar_customer_temsilci_read" on kullanicilar
  for select using (
    tip = 'zna'
    and id in (
      select temsilci_kullanici_id
        from musteriler
       where id = current_musteri_id()
         and temsilci_kullanici_id is not null
    )
  );
