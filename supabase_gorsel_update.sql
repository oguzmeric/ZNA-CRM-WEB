-- ================================================================
-- Ürün görseli için kolon ekle
-- ================================================================
alter table stok_urunler add column if not exists gorsel_url text;
alter table stok_urunler add column if not exists katalogda_goster boolean default true;

-- ================================================================
-- Supabase Storage - Ürün Görselleri Bucket
-- ================================================================
insert into storage.buckets (id, name, public)
values ('urun-gorselleri', 'urun-gorselleri', true)
on conflict (id) do update set public = true;

-- Mevcut policy'leri temizle (varsa)
drop policy if exists "Public Read urun-gorselleri" on storage.objects;
drop policy if exists "Allow Upload urun-gorselleri" on storage.objects;
drop policy if exists "Allow Update urun-gorselleri" on storage.objects;
drop policy if exists "Allow Delete urun-gorselleri" on storage.objects;

-- Herkes okuyabilir (public bucket)
create policy "Public Read urun-gorselleri"
  on storage.objects for select
  using (bucket_id = 'urun-gorselleri');

-- Anonim upload/update/delete
create policy "Allow Upload urun-gorselleri"
  on storage.objects for insert
  with check (bucket_id = 'urun-gorselleri');

create policy "Allow Update urun-gorselleri"
  on storage.objects for update
  using (bucket_id = 'urun-gorselleri');

create policy "Allow Delete urun-gorselleri"
  on storage.objects for delete
  using (bucket_id = 'urun-gorselleri');
