-- =====================================================================
-- Görüşmelere dosya ekleme: kolon + Storage policy'leri
-- =====================================================================
-- Bucket 'gorusme-dosyalari' service_role tarafından önceden oluşturulmuş.
-- Bu script:
--   1. gorusmeler tablosuna 'dosyalar' jsonb kolonu ekler
--   2. Bucket için RLS policy'leri tanımlar
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. Kolon
-- ─────────────────────────────────────────────────────────────────────
alter table gorusmeler
  add column if not exists dosyalar jsonb default '[]'::jsonb;

-- dosyalar formatı:
-- [{ path: 'gorusmeler/42/foto.jpg', name: 'foto.jpg', type: 'image/jpeg',
--    size: 123456, uploadedAt: '2026-04-24T10:30:00Z', uploaderAd: 'Ali' }]


-- ─────────────────────────────────────────────────────────────────────
-- 2. Storage policy'leri
-- ─────────────────────────────────────────────────────────────────────
-- Eski policy'leri temizle (idempotent)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'gorusme_dosya%'
  loop
    execute format('drop policy if exists %I on storage.objects;', p.policyname);
  end loop;
end $$;

-- Personel + admin tüm dosyaları okur
create policy "gorusme_dosya_staff_read" on storage.objects
  for select using (bucket_id = 'gorusme-dosyalari' and is_staff());

-- Personel + admin dosya yükler
create policy "gorusme_dosya_staff_insert" on storage.objects
  for insert with check (bucket_id = 'gorusme-dosyalari' and is_staff());

-- Personel + admin dosya siler (kendi yüklediği + başkasının — ekip paylaşımı)
create policy "gorusme_dosya_staff_delete" on storage.objects
  for delete using (bucket_id = 'gorusme-dosyalari' and is_staff());

-- ROLLBACK:
-- alter table gorusmeler drop column if exists dosyalar;
-- drop policy if exists gorusme_dosya_staff_read on storage.objects;
-- drop policy if exists gorusme_dosya_staff_insert on storage.objects;
-- drop policy if exists gorusme_dosya_staff_delete on storage.objects;
