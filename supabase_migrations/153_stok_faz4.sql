-- 153: Stok v2 Faz 4 — Ürün aileleri + Gerçek depo yapısı + Servis malzemeleri
-- Spec md 7 (varyantlar), 8 (depo bazlı stok), 9-Servis (teknisyen deposundan düşüm).

-- ==================== ÜRÜN AİLELERİ ====================
-- "Trassir C32 Kamera Serisi" gibi; TC-C32XN ↔ TC-C32GN kardeşliği.
create table if not exists stok_aileler (
  id bigint generated always as identity primary key,
  ad text not null,
  aciklama text,
  olusturma_tarih timestamptz not null default now()
);
create unique index if not exists ux_stok_aile_ad on stok_aileler (lower(trim(ad)));

alter table stok_urunler add column if not exists aile_id bigint references stok_aileler(id) on delete set null;
create index if not exists ix_stok_urun_aile on stok_urunler (aile_id);

-- RLS: ürün kartını düzenleyen herkes aile oluşturabilsin/atayabilsin (staff)
alter table stok_aileler enable row level security;
drop policy if exists stok_aile_all on stok_aileler;
create policy stok_aile_all on stok_aileler
  for all using (is_staff()) with check (is_staff());

-- ==================== DEPOLAR ====================
-- Fiziksel/mantıksal depolar. SN'in İŞ durumu stok_kalemleri.durum'da kalır
-- (depoda/teknisyende/...); depo_id yalnız 'depoda' iken fiziksel konumu söyler.
-- depo_id NULL = Merkez Depo (geriye dönük tüm kayıtlar).
create table if not exists depolar (
  id bigint generated always as identity primary key,
  ad text not null,
  tip text not null default 'gecici'
    check (tip in ('merkez','arac','proje','servis','gecici')),
  aciklama text,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now()
);
create unique index if not exists ux_depo_ad on depolar (lower(trim(ad)));

alter table stok_kalemleri add column if not exists depo_id bigint references depolar(id) on delete set null;
create index if not exists ix_stok_kalem_depo on stok_kalemleri (depo_id);

alter table depolar enable row level security;
drop policy if exists depolar_sel on depolar;
create policy depolar_sel on depolar for select using (is_staff());
drop policy if exists depolar_ins on depolar;
create policy depolar_ins on depolar for insert with check (is_admin());
drop policy if exists depolar_upd on depolar;
create policy depolar_upd on depolar for update using (is_admin()) with check (is_admin());
drop policy if exists depolar_del on depolar;
create policy depolar_del on depolar for delete using (is_admin());

-- Seed: Merkez Depo (idempotent)
insert into depolar (ad, tip, aciklama)
select 'Merkez Depo', 'merkez', 'Varsayılan ana depo — depo atanmamış tüm SN''ler burada sayılır'
where not exists (select 1 from depolar where tip = 'merkez');

-- ==================== SERVİS MALZEMELERİ ====================
-- Servis talebinde kullanılan malzemeler; SN'li ise kalem_id bağlanır ve
-- kalem durumu 'sahada' yapılır (teknisyen deposundan düşüm — client akışı).
create table if not exists servis_malzemeleri (
  id bigint generated always as identity primary key,
  servis_id bigint not null references servis_talepleri(id) on delete cascade,
  stok_kodu text,
  urun_adi text not null,
  miktar numeric not null default 1,
  birim text default 'Adet',
  seri_no text,
  kalem_id bigint references stok_kalemleri(id) on delete set null,
  kullanici_id bigint,
  kullanici_ad text,
  tarih timestamptz not null default now()
);
create index if not exists ix_servis_malzeme_servis on servis_malzemeleri (servis_id);
create index if not exists ix_servis_malzeme_stok on servis_malzemeleri (stok_kodu);

alter table servis_malzemeleri enable row level security;
drop policy if exists servis_malzeme_all on servis_malzemeleri;
create policy servis_malzeme_all on servis_malzemeleri
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
