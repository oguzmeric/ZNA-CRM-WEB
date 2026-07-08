-- 119: Depo v3 — arıza kayıtları, RMA, rezerve, sayım
-- Idempotent: birden çok kez çalıştırılabilir.

-- ─────────────────────────────────────────────────────────────
-- 1) stok_kalemleri: rezerve ve garanti alanları
-- ─────────────────────────────────────────────────────────────
alter table stok_kalemleri
  add column if not exists rezerve_teklif_id bigint references teklifler(id) on delete set null,
  add column if not exists rezerve_tarih timestamptz,
  add column if not exists garanti_bitis_tarihi date;

create index if not exists stok_kalemleri_rezerve_idx
  on stok_kalemleri (rezerve_teklif_id) where rezerve_teklif_id is not null;

-- rezerve tutarlılığı: rezerve_teklif_id NULL ise rezerve_tarih de NULL
create or replace function stok_kalemleri_rezerve_temizle()
returns trigger language plpgsql as $$
begin
  if new.rezerve_teklif_id is null then new.rezerve_tarih := null; end if;
  if new.rezerve_teklif_id is not null and new.rezerve_tarih is null then
    new.rezerve_tarih := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stok_kalemleri_rezerve_trg on stok_kalemleri;
create trigger stok_kalemleri_rezerve_trg
  before insert or update on stok_kalemleri
  for each row execute function stok_kalemleri_rezerve_temizle();

-- ─────────────────────────────────────────────────────────────
-- 2) stok_ariza_kayitlari — arıza sebebi + kaynak audit
-- ─────────────────────────────────────────────────────────────
create table if not exists stok_ariza_kayitlari (
  id                 bigserial primary key,
  stok_kalem_id      bigint not null references stok_kalemleri(id) on delete cascade,
  sebep              text not null,
  aciklama           text,
  geldigi_teknisyen_id bigint references kullanicilar(id) on delete set null,
  geldigi_musteri_id bigint references musteriler(id) on delete set null,
  olusturuldu        timestamptz not null default now(),
  olusturan_id       bigint references kullanicilar(id) on delete set null,
  cozum_notu         text,
  cozuldu_tarih      timestamptz
);

create index if not exists stok_ariza_kalem_idx on stok_ariza_kayitlari (stok_kalem_id);
create index if not exists stok_ariza_acik_idx on stok_ariza_kayitlari (cozuldu_tarih) where cozuldu_tarih is null;

alter table stok_ariza_kayitlari enable row level security;
drop policy if exists "stok_ariza_staff_all" on stok_ariza_kayitlari;
create policy "stok_ariza_staff_all" on stok_ariza_kayitlari
  for all using (is_staff()) with check (is_staff());

-- ─────────────────────────────────────────────────────────────
-- 3) stok_rma_kayitlari — tedarikçiye/servise gönderme
-- ─────────────────────────────────────────────────────────────
create table if not exists stok_rma_kayitlari (
  id                 bigserial primary key,
  stok_kalem_id      bigint not null references stok_kalemleri(id) on delete cascade,
  tedarikci_ad       text not null,
  kargo_no           text,
  gonderim_tarih     timestamptz not null default now(),
  tahmini_donus      date,
  geri_donus_tarih   timestamptz,
  sonuc              text check (sonuc in ('onarildi','degistirildi','red','iptal')),
  notlar             text,
  olusturan_id       bigint references kullanicilar(id) on delete set null,
  olusturuldu        timestamptz not null default now()
);

create index if not exists stok_rma_kalem_idx on stok_rma_kayitlari (stok_kalem_id);
create index if not exists stok_rma_acik_idx on stok_rma_kayitlari (geri_donus_tarih) where geri_donus_tarih is null;

alter table stok_rma_kayitlari enable row level security;
drop policy if exists "stok_rma_staff_all" on stok_rma_kayitlari;
create policy "stok_rma_staff_all" on stok_rma_kayitlari
  for all using (is_staff()) with check (is_staff());

-- ─────────────────────────────────────────────────────────────
-- 4) stok_sayimlar + stok_sayim_kalemleri
-- ─────────────────────────────────────────────────────────────
create table if not exists stok_sayimlar (
  id                 bigserial primary key,
  aciklama           text,
  olusturan_id       bigint references kullanicilar(id) on delete set null,
  olusturuldu        timestamptz not null default now(),
  tamamlandi         boolean not null default false,
  tamamlanma_tarihi  timestamptz
);

create table if not exists stok_sayim_kalemleri (
  id            bigserial primary key,
  sayim_id      bigint not null references stok_sayimlar(id) on delete cascade,
  stok_kalem_id bigint not null references stok_kalemleri(id) on delete cascade,
  tarandi       boolean not null default false,
  tarama_zamani timestamptz,
  unique (sayim_id, stok_kalem_id)
);

create index if not exists stok_sayim_kalem_sayim_idx on stok_sayim_kalemleri (sayim_id);

alter table stok_sayimlar enable row level security;
alter table stok_sayim_kalemleri enable row level security;

drop policy if exists "stok_sayim_staff_all" on stok_sayimlar;
create policy "stok_sayim_staff_all" on stok_sayimlar
  for all using (is_staff()) with check (is_staff());

drop policy if exists "stok_sayim_kalem_staff_all" on stok_sayim_kalemleri;
create policy "stok_sayim_kalem_staff_all" on stok_sayim_kalemleri
  for all using (is_staff()) with check (is_staff());

-- ─────────────────────────────────────────────────────────────
-- 5) PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
