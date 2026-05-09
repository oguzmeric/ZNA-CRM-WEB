-- 032_servis_formlari_bucket.sql
-- Storage bucket setup: servis formu PDF arşivi.

-- Bucket'ı oluştur (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('servis-formlari', 'servis-formlari', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Authenticated user dosyaları görsün (signed URL ile indirir)
create policy "auth_select_servis_formlari" on storage.objects
  for select to authenticated
  using (bucket_id = 'servis-formlari');

-- Authenticated user dosya yüklesin
create policy "auth_insert_servis_formlari" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'servis-formlari');
