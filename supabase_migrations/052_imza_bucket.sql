-- Generic imza bucket — kullanici profil imzasi + siparis onay imzalari.
-- 'siparis-imzalari' bucket'ini sadece yetkili upload edebiliyordu;
-- profil imzasini her personel kendi profilinden ekleyecek, bu yuzden ayri bucket.
--
-- Klasor yapisi:
--   kullanici-{id}/profil.{ext}   — kullanicinin profil imzasi
--   teklif-{id}/onay-{ts}.{ext}    — bir teklifin siparis onayinda kullanilan kopya

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('imzalar', 'imzalar', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

-- Herhangi bir kimligi dogrulanmis personel upload edebilir
drop policy if exists "imza_personel_upload" on storage.objects;
create policy "imza_personel_upload" on storage.objects
  for insert with check (
    bucket_id = 'imzalar'
    and (
      select tip from kullanicilar where auth_id = auth.uid()
    ) != 'musteri'
  );

-- Update icin de ayni kontrol
drop policy if exists "imza_personel_update" on storage.objects;
create policy "imza_personel_update" on storage.objects
  for update using (
    bucket_id = 'imzalar'
    and (
      select tip from kullanicilar where auth_id = auth.uid()
    ) != 'musteri'
  );

-- Herkes okuyabilir (public bucket)
drop policy if exists "imza_public_select" on storage.objects;
create policy "imza_public_select" on storage.objects
  for select using (bucket_id = 'imzalar');
