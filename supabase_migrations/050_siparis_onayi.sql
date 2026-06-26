-- Sipariş onay sistemi.
--
-- Akış:
--   1. Teklif onay_durumu = 'kabul' olunca → siparis_onayi.durum = 'bekliyor' set edilir
--   2. Yetkili (siparis_onay_yetkilisi=true) Sipariş Onayları sayfasından imza ekleyerek onaylar veya reddeder
--   3. Onaylı → satın alma akışı başlar (ileride)
--   4. Raporlamada "Satış Sipariş Onay" başlığı altında özet (toplam onaylı tutar, bekleyenler vs.)

-- ============================================================================
-- Yetkili kullanıcılar
-- ============================================================================
alter table kullanicilar
  add column if not exists siparis_onay_yetkilisi boolean not null default false;

-- Ali Uğur Aktepe (id=1) sipariş onay yetkilisi
update kullanicilar set siparis_onay_yetkilisi = true where id = 1;

-- ============================================================================
-- Teklif tablosuna sipariş onayı bilgisi
-- ============================================================================
alter table teklifler
  add column if not exists siparis_onayi jsonb default null;

-- Yapı (sadece doc — kontrol yok):
-- {
--   "durum": "bekliyor" | "onayli" | "reddedildi",
--   "onaylayan_id": int,
--   "onaylayan_ad": text,
--   "onay_tarihi": iso timestamp,
--   "imza_url": text (storage URL),
--   "red_nedeni": text (sadece reddedildi durumunda)
-- }

-- Kabul edilen mevcut tekliflere otomatik 'bekliyor' set et (backfill)
update teklifler
   set siparis_onayi = jsonb_build_object('durum', 'bekliyor')
 where onay_durumu = 'kabul'
   and siparis_onayi is null;

-- ============================================================================
-- Index — bekleyenleri listelemek için
-- ============================================================================
create index if not exists idx_teklifler_siparis_onay_durum
  on teklifler ((siparis_onayi->>'durum'))
  where siparis_onayi is not null;

-- ============================================================================
-- Storage bucket — imza dosyaları (ayrı SQL çünkü storage schema farklı)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('siparis-imzalari', 'siparis-imzalari', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

-- Bucket policies — yetkili upload edebilir, herkes okuyabilir (public)
drop policy if exists "siparis_imza_yetkili_upload" on storage.objects;
create policy "siparis_imza_yetkili_upload" on storage.objects
  for insert with check (
    bucket_id = 'siparis-imzalari'
    and (
      select siparis_onay_yetkilisi from kullanicilar where auth_id = auth.uid()
    ) = true
  );

drop policy if exists "siparis_imza_public_select" on storage.objects;
create policy "siparis_imza_public_select" on storage.objects
  for select using (bucket_id = 'siparis-imzalari');

notify pgrst, 'reload schema';
