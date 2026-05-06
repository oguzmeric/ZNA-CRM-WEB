-- =====================================================================
-- Bildirimler tablosu — kullanıcılar arası gerçek bildirim sistemi
-- =====================================================================
-- Önce localStorage tabanlıydı, bu yüzden atayan dışındaki kişiler
-- bildirimi göremiyordu. Şimdi DB tabanlı + Realtime ile anlık.
-- =====================================================================

create table if not exists bildirimler (
  id bigserial primary key,
  alici_id bigint not null references kullanicilar(id) on delete cascade,
  gonderen_id bigint references kullanicilar(id) on delete set null,
  baslik text not null,
  mesaj text,
  tip text default 'bilgi',           -- 'bilgi' | 'uyari' | 'hata' | 'basari' | 'mention'
  link text,                           -- /gorevler/123 gibi
  okundu boolean not null default false,
  okunma_tarih timestamptz,
  meta jsonb,                          -- ek context (görev id, mention bağlamı, vb.)
  olusturma_tarih timestamptz default now()
);

create index if not exists idx_bildirimler_alici on bildirimler(alici_id, okundu, olusturma_tarih desc);
create index if not exists idx_bildirimler_olusturma on bildirimler(olusturma_tarih desc);

-- RLS — herkes sadece kendine yönelik bildirimleri görür
alter table bildirimler enable row level security;
alter table bildirimler force row level security;

drop policy if exists "bildirimler_owner_read" on bildirimler;
drop policy if exists "bildirimler_staff_insert" on bildirimler;
drop policy if exists "bildirimler_owner_update" on bildirimler;
drop policy if exists "bildirimler_owner_delete" on bildirimler;

-- Kullanıcı sadece KENDİNE gelen bildirimleri okuyabilir
create policy "bildirimler_owner_read" on bildirimler
  for select using (
    alici_id in (select id from kullanicilar where auth_id = auth.uid())
  );

-- Personel başkasına bildirim gönderebilir, müşteri sadece kendine bağlı
create policy "bildirimler_staff_insert" on bildirimler
  for insert with check (
    is_staff() or
    alici_id in (select id from kullanicilar where auth_id = auth.uid())
  );

-- Kullanıcı kendi bildirimini okundu işaretleyebilir
create policy "bildirimler_owner_update" on bildirimler
  for update using (
    alici_id in (select id from kullanicilar where auth_id = auth.uid())
  ) with check (
    alici_id in (select id from kullanicilar where auth_id = auth.uid())
  );

-- Kullanıcı kendi bildirimini silebilir
create policy "bildirimler_owner_delete" on bildirimler
  for delete using (
    alici_id in (select id from kullanicilar where auth_id = auth.uid())
  );

-- Realtime için tabloyu publication'a ekle
alter publication supabase_realtime add table bildirimler;

notify pgrst, 'reload schema';
