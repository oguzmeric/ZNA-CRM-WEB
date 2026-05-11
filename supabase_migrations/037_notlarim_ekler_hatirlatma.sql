-- 037_notlarim_ekler_hatirlatma.sql
-- Notlarım'a: foto/belge ekleri + hatırlatıcı desteği

alter table public.notlarim
  add column if not exists ekler jsonb not null default '[]'::jsonb,
  add column if not exists hatirlatma_tarihi timestamptz,
  add column if not exists hatirlatildi boolean not null default false;

-- Hatırlatması olan ve henüz hatırlatılmamış notlar için index
create index if not exists idx_notlarim_hatirlatma
  on public.notlarim(hatirlatma_tarihi)
  where hatirlatma_tarihi is not null and hatirlatildi = false;

-- Ekler bucket — foto + belge (PDF, doc, xls, image)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'not-ekleri',
  'not-ekleri',
  false,
  10485760,  -- 10MB
  array[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do nothing;

create policy "auth_select_not_ekleri" on storage.objects
  for select to authenticated
  using (bucket_id = 'not-ekleri');

create policy "auth_insert_not_ekleri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'not-ekleri');

create policy "auth_delete_not_ekleri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'not-ekleri');

notify pgrst, 'reload schema';
