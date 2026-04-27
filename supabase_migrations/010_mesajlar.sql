-- Sohbet mesajları: kullanıcılar arası 1-1 mesajlaşma
-- Realtime + RLS

create table if not exists mesajlar (
  id bigserial primary key,
  gonderici_id bigint not null references kullanicilar(id) on delete cascade,
  alici_id     bigint not null references kullanicilar(id) on delete cascade,
  icerik       text   not null,
  tarih        timestamptz not null default now(),
  okundu       boolean not null default false
);

create index if not exists idx_mesajlar_alici_okundu on mesajlar(alici_id, okundu);
create index if not exists idx_mesajlar_konusma on mesajlar(gonderici_id, alici_id, tarih);
create index if not exists idx_mesajlar_tarih on mesajlar(tarih desc);

-- Mevcut kullanıcının kullanicilar.id'si (bigint)
create or replace function current_kullanici_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from kullanicilar where auth_id = auth.uid() limit 1;
$$;

alter table mesajlar enable row level security;

drop policy if exists "mesajlar_select_self" on mesajlar;
create policy "mesajlar_select_self" on mesajlar
  for select using (
    is_admin()
    or gonderici_id = current_kullanici_id()
    or alici_id     = current_kullanici_id()
  );

drop policy if exists "mesajlar_insert_self" on mesajlar;
create policy "mesajlar_insert_self" on mesajlar
  for insert with check (
    gonderici_id = current_kullanici_id()
  );

-- Sadece alıcı okundu bayrağını değiştirebilir
drop policy if exists "mesajlar_update_alici" on mesajlar;
create policy "mesajlar_update_alici" on mesajlar
  for update using (alici_id = current_kullanici_id())
             with check (alici_id = current_kullanici_id());

drop policy if exists "mesajlar_delete_admin" on mesajlar;
create policy "mesajlar_delete_admin" on mesajlar
  for delete using (is_admin());

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mesajlar'
  ) then
    execute 'alter publication supabase_realtime add table mesajlar';
  end if;
end $$;

notify pgrst, 'reload schema';
