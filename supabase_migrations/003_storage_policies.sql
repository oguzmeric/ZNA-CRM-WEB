-- =====================================================================
-- FAZ 2+ — Storage bucket policy'leri (urun-gorselleri)
-- =====================================================================
-- Önkoşul: 002_rls_policies.sql çalıştırılmış, is_staff() fonksiyonu var.
--
-- Bucket 'urun-gorselleri' stok ürün görselleri için kullanılıyor.
-- Mantık: herkes okur (katalog public), sadece personel yazar/siler.
--
-- Tek seferde çalıştır — idempotent.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM A — Bucket'ı public yap (read erişim için)
-- ─────────────────────────────────────────────────────────────────────
-- Eğer Supabase Dashboard'da Storage > urun-gorselleri > Settings'ten
-- manuel "Public bucket" açtıysan bu adım gereksiz.
update storage.buckets set public = true where id = 'urun-gorselleri';


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM B — Eski policy'leri temizle (idempotent re-run için)
-- ─────────────────────────────────────────────────────────────────────
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'urun_gorsel%'
  loop
    execute format('drop policy if exists %I on storage.objects;', p.policyname);
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM C — Policy'ler
-- ─────────────────────────────────────────────────────────────────────

-- Herkes (anon dahil) okuyabilir — müşteri katalogu public olacaksa bu gerekli
create policy "urun_gorsel_public_read" on storage.objects
  for select using (bucket_id = 'urun-gorselleri');

-- Sadece personel yükleyebilir
create policy "urun_gorsel_staff_insert" on storage.objects
  for insert with check (bucket_id = 'urun-gorselleri' and is_staff());

-- Sadece personel güncelleyebilir (overwrite)
create policy "urun_gorsel_staff_update" on storage.objects
  for update using (bucket_id = 'urun-gorselleri' and is_staff())
             with check (bucket_id = 'urun-gorselleri' and is_staff());

-- Sadece personel silebilir
create policy "urun_gorsel_staff_delete" on storage.objects
  for delete using (bucket_id = 'urun-gorselleri' and is_staff());


-- ─────────────────────────────────────────────────────────────────────
-- KONTROL
-- ─────────────────────────────────────────────────────────────────────
-- Bucket public mi?
-- select id, name, public from storage.buckets where id = 'urun-gorselleri';
--
-- Policy'ler kuruldu mu?
-- select policyname, cmd from pg_policies
--  where schemaname = 'storage' and policyname like 'urun_gorsel%';


-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────
-- do $$
-- declare p record;
-- begin
--   for p in
--     select policyname from pg_policies
--      where schemaname = 'storage' and policyname like 'urun_gorsel%'
--   loop
--     execute format('drop policy if exists %I on storage.objects;', p.policyname);
--   end loop;
-- end $$;
