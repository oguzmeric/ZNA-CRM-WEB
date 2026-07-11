-- 139: Keşif Modülü — saha keşif kayıtları.
-- Akış: teknisyen/satışçı sahaya keşfe gider → müşteri + lokasyon + notlar +
-- malzeme listesi (kamera adedi/modeli vb.) + fotoğraflar kaydedilir →
-- keşif tek tıkla Teklife / Göreve / Servis Talebine dönüştürülür
-- (dönüşüm id'leri kesifler üzerinde tutulur, süreç izlenebilir).

-- ==================== KEŞİFLER ====================
create table if not exists kesifler (
  id              bigserial primary key,
  kesif_no        text unique,                      -- KSF-YYYY-NNNN (trigger üretir)
  musteri_id      bigint references musteriler(id) on delete set null,
  firma_adi       text,
  lokasyon        text,                             -- adres / saha tanımı
  kesif_tarihi    date not null default current_date,
  kesfi_yapan     text,                             -- sahaya giden kişi(ler)
  durum           text not null default 'acik'
                  check (durum in ('acik','tamamlandi','iptal')),
  genel_not       text,
  -- Dönüşüm bağlantıları (oluşturulunca doldurulur)
  teklif_id       bigint,
  gorev_id        bigint,
  servis_talep_id bigint,
  olusturan_id    bigint references kullanicilar(id) on delete set null,
  olusturan_ad    text,
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

create index if not exists kesif_musteri_idx on kesifler(musteri_id);
create index if not exists kesif_durum_idx on kesifler(durum);

-- KSF-YYYY-NNNN numara üretici (gorusme_no/teklif_no pattern — max+1)
create or replace function kesif_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son int;
  v_pattern text;
begin
  if new.kesif_no is not null and new.kesif_no <> '' then
    return new;
  end if;
  v_pattern := '^KSF-' || v_yil || '-(\d+)$';
  select coalesce(max(substring(kesif_no from v_pattern)::int), 0)
    into v_son
    from kesifler
   where kesif_no ~ v_pattern;
  new.kesif_no := 'KSF-' || v_yil || '-' || lpad((v_son + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_kesif_no on kesifler;
create trigger trg_kesif_no before insert on kesifler
  for each row execute function kesif_no_uret();

-- guncelleme_tarih trigger
create or replace function kesif_guncelleme_tetikleyici()
returns trigger language plpgsql as $$
begin new.guncelleme_tarih := now(); return new; end;
$$;
drop trigger if exists trg_kesif_guncelleme on kesifler;
create trigger trg_kesif_guncelleme before update on kesifler
  for each row execute function kesif_guncelleme_tetikleyici();

-- ==================== KEŞİF KALEMLERİ (malzeme listesi) ====================
create table if not exists kesif_kalemleri (
  id              bigserial primary key,
  kesif_id        bigint not null references kesifler(id) on delete cascade,
  kategori        text not null default 'malzeme'
                  check (kategori in ('kamera','kayit_cihazi','kablo','network','malzeme','iscilik','diger')),
  stok_kodu       text,                             -- stok kartına opsiyonel bağ
  urun_adi        text not null,
  marka           text,
  miktar          numeric not null default 1,
  birim           text not null default 'Adet',
  notlar          text,
  siralama        int not null default 0,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists kesif_kalem_kesif_idx on kesif_kalemleri(kesif_id);

-- ==================== KEŞİF FOTOĞRAFLARI ====================
create table if not exists kesif_fotolari (
  id              bigserial primary key,
  kesif_id        bigint not null references kesifler(id) on delete cascade,
  dosya_yolu      text not null,                    -- storage path: {kesif_id}/{ts}.jpg
  aciklama        text,
  olusturan_ad    text,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists kesif_foto_kesif_idx on kesif_fotolari(kesif_id);

-- ==================== RLS ====================
alter table kesifler enable row level security;
alter table kesif_kalemleri enable row level security;
alter table kesif_fotolari enable row level security;

drop policy if exists kesif_staff_all on kesifler;
create policy kesif_staff_all on kesifler
  for all using (is_staff()) with check (is_staff());

drop policy if exists kesif_kalem_staff_all on kesif_kalemleri;
create policy kesif_kalem_staff_all on kesif_kalemleri
  for all using (is_staff()) with check (is_staff());

drop policy if exists kesif_foto_staff_all on kesif_fotolari;
create policy kesif_foto_staff_all on kesif_fotolari
  for all using (is_staff()) with check (is_staff());

-- ==================== STORAGE ====================
insert into storage.buckets (id, name, public)
values ('kesif-foto', 'kesif-foto', false)
on conflict do nothing;

drop policy if exists kesif_foto_sel on storage.objects;
create policy kesif_foto_sel on storage.objects for select
  using (bucket_id = 'kesif-foto' and is_staff());
drop policy if exists kesif_foto_ins on storage.objects;
create policy kesif_foto_ins on storage.objects for insert
  with check (bucket_id = 'kesif-foto' and is_staff());
drop policy if exists kesif_foto_del on storage.objects;
create policy kesif_foto_del on storage.objects for delete
  using (bucket_id = 'kesif-foto' and is_staff());

notify pgrst, 'reload schema';
