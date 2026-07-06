-- 097: Public storage bucket'larda anon listing'i kapat
-- Advisor: "Public Bucket Allows Listing" x3 → 0
--
-- Mevcut durum: bucket public + broad SELECT policy → herkes list edebiliyor
--   (getPublicUrl endpoint'i public, anon list edip tüm imza dosyalarını enumere edebiliyor)
--
-- Hedef: bucket public kalsın (URL'ler çalışmaya devam etsin) ama SELECT policy'yi
--        authenticated'a daralt → anon list yok. getPublicUrl bozulmaz çünkü public endpoint
--        storage.objects RLS'ini bypass eder.

-- ─── imzalar bucket ───────────────────────────────────────────────────
drop policy if exists "imza_public_select" on storage.objects;
create policy "imza_authenticated_select" on storage.objects
  for select using (
    bucket_id = 'imzalar'
    and auth.role() = 'authenticated'
  );

-- ─── siparis-imzalari bucket ──────────────────────────────────────────
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname ilike '%siparis%imza%'
      and policyname ilike '%select%'
  loop
    execute format('drop policy if exists %I on storage.objects;', p.policyname);
  end loop;
end $$;

create policy "siparis_imza_authenticated_select" on storage.objects
  for select using (
    bucket_id = 'siparis-imzalari'
    and auth.role() = 'authenticated'
  );

-- ─── urun-gorselleri bucket ───────────────────────────────────────────
drop policy if exists "urun_gorsel_public_read" on storage.objects;
create policy "urun_gorsel_authenticated_select" on storage.objects
  for select using (
    bucket_id = 'urun-gorselleri'
    and auth.role() = 'authenticated'
  );

-- NOT: 3 bucket da hala public=true, yani getPublicUrl endpoint'i
--      /storage/v1/object/public/{bucket}/{path} çalışmaya devam ediyor.
--      Değişen tek şey: anon artık list() ile dosya isimlerini enumere edemez.
