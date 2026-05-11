-- 036_notlarim.sql
-- Kullanıcıların kişisel notları + opsiyonel müşteri bağlantısı + çizim ekleri.

create table public.notlarim (
  id bigserial primary key,
  kullanici_id bigint not null references public.kullanicilar(id) on delete cascade,
  baslik text,
  icerik text,
  kategori text not null default 'diger' check (kategori in ('kesif', 'toplanti', 'fikir', 'diger')),
  musteri_id bigint references public.musteriler(id) on delete set null,
  cizimler jsonb not null default '[]'::jsonb,  -- [{path, url, eklenme_tarih}]
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

create index idx_notlarim_kullanici on public.notlarim(kullanici_id, olusturma_tarih desc);
create index idx_notlarim_musteri on public.notlarim(musteri_id) where musteri_id is not null;

-- Otomatik guncelleme_tarih
create or replace function update_notlarim_guncelleme()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarih = now();
  return new;
end;
$$;

create trigger tr_notlarim_update
  before update on public.notlarim
  for each row execute function update_notlarim_guncelleme();

-- RLS
alter table public.notlarim enable row level security;

create policy "auth_select_notlarim" on public.notlarim
  for select to authenticated using (true);

create policy "auth_insert_notlarim" on public.notlarim
  for insert to authenticated with check (true);

create policy "auth_update_notlarim" on public.notlarim
  for update to authenticated using (true) with check (true);

create policy "auth_delete_notlarim" on public.notlarim
  for delete to authenticated using (true);

-- Storage bucket: not çizimleri (PNG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('not-cizimleri', 'not-cizimleri', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "auth_select_not_cizimleri" on storage.objects
  for select to authenticated
  using (bucket_id = 'not-cizimleri');

create policy "auth_insert_not_cizimleri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'not-cizimleri');

create policy "auth_delete_not_cizimleri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'not-cizimleri');

notify pgrst, 'reload schema';
