-- Depo iyileştirme paketi (2026-07-12):
--   1) stok_opsiyonlar — localStorage'dan DB'ye (çoklu kullanıcı + veri kaybı riski)
--   2) stok_urunler.alis_fiyat + raf — stok değeri raporu ve lokasyon
--   3) stok_sayimlar sayaç kolonları — sayım farkının kalıcı kaydı

-- ── 1) Stok opsiyonları ─────────────────────────────────────────────
create table if not exists stok_opsiyonlar (
  id              bigserial primary key,
  opsiyon_no      text unique,
  stok_kodu       text not null,
  stok_adi        text,
  miktar          numeric not null default 0,
  satisci_id      bigint references kullanicilar(id) on delete set null,
  satisci_ad      text,
  musteri_adi     text,
  aciklama        text,
  bitis_tarih     date,
  durum           text not null default 'aktif'
                  check (durum in ('aktif','onaylandi','iptal','suresi_doldu')),
  olusturan_id    bigint references kullanicilar(id) on delete set null,
  olusturan_ad    text,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists idx_stok_opsiyon_aktif
  on stok_opsiyonlar(stok_kodu) where durum = 'aktif';

-- Opsiyon no otomatik: OPS-0001 formatı, mevcut max + 1 (localStorage'dan
-- import edilen eski numaralarla çakışmasın diye count değil max bazlı)
create or replace function tr_stok_opsiyon_no_uret()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max int;
begin
  if new.opsiyon_no is not null and new.opsiyon_no <> '' then
    return new;
  end if;
  select coalesce(max((substring(opsiyon_no from '^OPS-(\d+)$'))::int), 0)
    into v_max
    from stok_opsiyonlar
   where opsiyon_no ~ '^OPS-\d+$';
  new.opsiyon_no := 'OPS-' || lpad((v_max + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_stok_opsiyon_no on stok_opsiyonlar;
create trigger trg_stok_opsiyon_no
  before insert on stok_opsiyonlar
  for each row execute function tr_stok_opsiyon_no_uret();

alter table stok_opsiyonlar enable row level security;

drop policy if exists "opsiyon_select_auth" on stok_opsiyonlar;
create policy "opsiyon_select_auth" on stok_opsiyonlar
  for select to authenticated using (true);

drop policy if exists "opsiyon_insert_auth" on stok_opsiyonlar;
create policy "opsiyon_insert_auth" on stok_opsiyonlar
  for insert to authenticated with check (true);

drop policy if exists "opsiyon_update_auth" on stok_opsiyonlar;
create policy "opsiyon_update_auth" on stok_opsiyonlar
  for update to authenticated using (true);

drop policy if exists "opsiyon_delete_auth" on stok_opsiyonlar;
create policy "opsiyon_delete_auth" on stok_opsiyonlar
  for delete to authenticated using (true);

-- ── 2) Alış fiyatı + raf ────────────────────────────────────────────
alter table stok_urunler add column if not exists alis_fiyat numeric;
alter table stok_urunler add column if not exists raf text;

-- ── 3) Sayım farkı kalıcı kayıt ─────────────────────────────────────
alter table stok_sayimlar add column if not exists toplam_kalem  integer;
alter table stok_sayimlar add column if not exists tarandi_kalem integer;
alter table stok_sayimlar add column if not exists eksik_kalem   integer;

notify pgrst, 'reload schema';
