-- 184 — Görüşme yorumları + görev/yorum ekleri
--
-- İSTEK: (1) görüşme detayında da görev detayındaki gibi yorum yazılabilsin;
-- (2) yeni görev oluştururken dosya/resim eklenebilsin; (3) hem görev hem
-- görüşme yorumlarına eklenti (dosya/resim) konabilsin.
--
-- gorusme_yorumlari = mig 174'teki gorev_yorumlari deseninin birebir kopyası
-- (herkes okur + kendi adına yorum ekler; kendi yorumunu düzenler/siler; admin hepsi).
-- Ek dosyalar jsonb dizisi: [{ url, name, type, size }] — public bucket
-- urun-gorselleri'ne yüklenir (yorum-ekleri/, gorev-dosyalar/ klasörleri),
-- public URL doğrudan <img>/<a> ile gösterilir.

begin;

-- 1) GÖRÜŞME YORUMLARI
create table if not exists gorusme_yorumlari (
  id               uuid primary key default gen_random_uuid(),
  gorusme_id       bigint not null references gorusmeler(id) on delete cascade,
  kullanici_id     bigint references kullanicilar(id) on delete set null,
  yazar_ad         text not null,
  icerik           text not null,
  dosyalar         jsonb not null default '[]',
  duzenlendi       boolean not null default false,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz
);
create index if not exists idx_gorusme_yorumlari_gorusme on gorusme_yorumlari (gorusme_id, olusturma_tarih);

alter table gorusme_yorumlari enable row level security;

drop policy if exists gorusme_yorumlari_admin      on gorusme_yorumlari;
drop policy if exists gorusme_yorumlari_select     on gorusme_yorumlari;
drop policy if exists gorusme_yorumlari_insert     on gorusme_yorumlari;
drop policy if exists gorusme_yorumlari_update_own on gorusme_yorumlari;
drop policy if exists gorusme_yorumlari_delete_own on gorusme_yorumlari;

create policy gorusme_yorumlari_admin on gorusme_yorumlari
  for all using (is_admin()) with check (is_admin());

create policy gorusme_yorumlari_select on gorusme_yorumlari
  for select using (is_staff());

-- Yorumu yalnız KENDİ adına ekleyebilirsin (impersonation önlenir)
create policy gorusme_yorumlari_insert on gorusme_yorumlari
  for insert with check (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy gorusme_yorumlari_update_own on gorusme_yorumlari
  for update using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy gorusme_yorumlari_delete_own on gorusme_yorumlari
  for delete using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

-- 2) EK KOLONLARI
alter table gorev_yorumlari add column if not exists dosyalar jsonb not null default '[]';
alter table gorevler        add column if not exists dosyalar jsonb not null default '[]';

-- 3) Realtime (gorev_yorumlari mig 175'te eklendi — aynı desen)
do $$
begin
  begin
    alter publication supabase_realtime add table gorusme_yorumlari;
  exception when duplicate_object then null;
  end;
end $$;

commit;

notify pgrst, 'reload schema';
