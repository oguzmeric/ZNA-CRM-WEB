-- 033_push_tokenlari.sql
-- Cihaz başına Expo push token kaydı.

create table public.kullanici_push_tokenlari (
  id bigserial primary key,
  kullanici_id bigint not null references public.kullanicilar(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  son_gorulen timestamptz not null default now(),
  olusturma_tarih timestamptz not null default now(),
  unique (kullanici_id, token)
);

create index idx_push_tokenlari_kullanici on public.kullanici_push_tokenlari(kullanici_id);

alter table public.kullanici_push_tokenlari enable row level security;

create policy "auth_select_own_tokens" on public.kullanici_push_tokenlari
  for select to authenticated using (true);

create policy "auth_insert_tokens" on public.kullanici_push_tokenlari
  for insert to authenticated with check (true);

create policy "auth_update_own_tokens" on public.kullanici_push_tokenlari
  for update to authenticated using (true) with check (true);

create policy "auth_delete_own_tokens" on public.kullanici_push_tokenlari
  for delete to authenticated using (true);

notify pgrst, 'reload schema';
