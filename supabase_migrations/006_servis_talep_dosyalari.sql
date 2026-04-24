-- =====================================================================
-- Servis taleplerine dosya ekleme (hem müşteri portal hem personel)
-- =====================================================================
-- Bucket 'servis-talep-dosyalari' service_role ile önceden oluşturuldu.
-- =====================================================================

-- 1. Kolon
alter table servis_talepleri
  add column if not exists dosyalar jsonb default '[]'::jsonb;

-- 2. Storage policy'leri (eski temizle)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'servis_talep_dosya%'
  loop execute format('drop policy if exists %I on storage.objects;', p.policyname); end loop;
end $$;

-- Personel + admin: tüm dosyalara tam erişim
create policy "servis_talep_dosya_staff_all" on storage.objects
  for all using (bucket_id = 'servis-talep-dosyalari' and is_staff())
         with check (bucket_id = 'servis-talep-dosyalari' and is_staff());

-- Müşteri: sadece kendi taleplerine ait klasöre erişir
-- Klasör yapısı: servis-talep-dosyalari/<talep_id>/<file>
-- Kullanıcı talep_id yoluyla ulaşır; servis_talepleri.musteri_id = current_musteri_id() kontrolü
create policy "servis_talep_dosya_customer_read" on storage.objects
  for select using (
    bucket_id = 'servis-talep-dosyalari'
    and exists (
      select 1 from servis_talepleri t
       where t.musteri_id = current_musteri_id()
         and (storage.foldername(storage.objects.name))[1] = t.id::text
    )
  );

create policy "servis_talep_dosya_customer_insert" on storage.objects
  for insert with check (
    bucket_id = 'servis-talep-dosyalari'
    and exists (
      select 1 from servis_talepleri t
       where t.musteri_id = current_musteri_id()
         and (storage.foldername(storage.objects.name))[1] = t.id::text
    )
  );

-- Kontrol:
-- select id, name, public from storage.buckets where id = 'servis-talep-dosyalari';
-- select policyname from pg_policies where schemaname='storage' and policyname like 'servis_talep_dosya%';

-- ROLLBACK:
-- alter table servis_talepleri drop column if exists dosyalar;
-- drop policy if exists servis_talep_dosya_staff_all on storage.objects;
-- drop policy if exists servis_talep_dosya_customer_read on storage.objects;
-- drop policy if exists servis_talep_dosya_customer_insert on storage.objects;
