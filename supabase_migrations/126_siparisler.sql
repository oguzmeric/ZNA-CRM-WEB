-- 126: Siparişler (kalıcı) + ZNA-SIP-YYYY-NNNNNN üretici (Faz 3/5).
--
-- KRİTİK: Sipariş kaydı SADECE yetkili "Sipariş Onayı" verdiğinde oluşur.
-- Kaynak: (a) müşteri onayı geçmiş bir teklif, veya (b) bir ön sipariş.
-- Her iki durumda da onay anında bu tabloya INSERT edilir + sipariş no atanır.
--
-- Mevcut tablolara (teklifler, on_siparisler) DOKUNULMAZ.
-- Bkz: promt "Sipariş numarası yalnızca Sipariş Onayı tamamlandıktan sonra oluşur"
-- Bkz: 055_teklif_no_trigger.sql — max+1 no üretim paterni

-- ==================== ANA TABLO ====================
create table if not exists siparisler (
  id                bigserial primary key,
  siparis_no        text unique,                                    -- ZNA-SIP-2026-000001
  -- Bağlantılar
  musteri_id        bigint not null references musteriler(id) on delete restrict,
  gorusme_id        bigint references gorusmeler(id) on delete set null,
  -- Kaynak: hangi kayıttan doğdu (teklif VEYA ön sipariş)
  kaynak_tipi       text not null check (kaynak_tipi in ('teklif','on_siparis')),
  teklif_id         bigint references teklifler(id) on delete set null,
  on_siparis_id     bigint references on_siparisler(id) on delete set null,
  -- Durum
  durum             text not null default 'aktif'
                    check (durum in ('aktif','tamamlandi','iptal')),
  -- Onay bilgileri (Sipariş Onayı ekranından gelir)
  onay_tarihi       timestamptz not null default now(),
  onaylayan_id      bigint references kullanicilar(id) on delete set null,
  onaylayan_ad      text,
  imza_url          text,
  -- Tutarlar
  para_birimi       text not null default 'TL',
  doviz_kuru        numeric(14,4) default 1,
  genel_iskonto     numeric(14,2) default 0,
  genel_toplam      numeric(14,2) default 0,
  -- Meta
  konu              text,
  notlar            text,
  iptal_sebebi      text,
  olusturma_tarih   timestamptz not null default now(),
  guncelleme_tarih  timestamptz not null default now(),
  -- Bütünlük: kaynak_tipi = 'teklif' ise teklif_id dolu olmalı, ön_siparis için on_siparis_id
  constraint siparisler_kaynak_teklif_ck
    check (kaynak_tipi <> 'teklif' or teklif_id is not null),
  constraint siparisler_kaynak_on_siparis_ck
    check (kaynak_tipi <> 'on_siparis' or on_siparis_id is not null)
);

create index if not exists siparisler_musteri_idx     on siparisler (musteri_id);
create index if not exists siparisler_gorusme_idx     on siparisler (gorusme_id) where gorusme_id is not null;
create index if not exists siparisler_teklif_idx      on siparisler (teklif_id)  where teklif_id is not null;
create index if not exists siparisler_on_siparis_idx  on siparisler (on_siparis_id) where on_siparis_id is not null;
create index if not exists siparisler_durum_idx       on siparisler (durum);
create unique index if not exists siparisler_no_uidx  on siparisler (siparis_no) where siparis_no is not null;

-- ==================== KALEMLER ====================
-- Kaynak tekliften geldiyse: teklif satırlarından kopyalanır (fiyatlı).
-- Kaynak ön siparişten geldiyse: kalemler kopyalanır + onay ekranında fiyat girilir.
create table if not exists siparis_kalemleri (
  id                bigserial primary key,
  siparis_id        bigint not null references siparisler(id) on delete cascade,
  -- Ürün
  stok_kodu         text,                                           -- opsiyonel (manuel de olabilir)
  urun_ad           text not null,
  urun_marka        text,
  urun_model        text,
  kategori          text,
  birim             text not null default 'Adet',
  -- Miktar + Fiyat
  miktar            numeric(12,3) not null check (miktar > 0),
  birim_fiyat       numeric(14,2) not null default 0,
  iskonto_orani     numeric(5,2) default 0,
  kdv_orani         numeric(5,2) default 20,
  ara_toplam        numeric(14,2) not null default 0,               -- (miktar * birim_fiyat * (1-isk/100)) client hesaplar
  -- Meta
  aciklama          text,
  siralama          int default 0,
  olusturma_tarih   timestamptz not null default now()
);

create index if not exists siparis_kalemleri_siparis_idx on siparis_kalemleri (siparis_id);
create index if not exists siparis_kalemleri_stok_idx    on siparis_kalemleri (stok_kodu) where stok_kodu is not null;

-- ==================== SİPARİŞ NO ÜRETİCİ ====================
-- Format: ZNA-SIP-YYYY-NNNNNN (6 haneli padding, yıllık max+1).
-- Client vermezse trigger doldurur. Verirse dokunmaz.
create or replace function siparis_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil     int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son_no  int;
  v_pattern text;
begin
  if new.siparis_no is not null and new.siparis_no <> '' then
    return new;
  end if;

  v_pattern := '^ZNA-SIP-' || v_yil || '-(\d+)$';
  select coalesce(
    max(substring(siparis_no from v_pattern)::int),
    0
  ) into v_son_no
  from siparisler
  where siparis_no ~ v_pattern;

  new.siparis_no := 'ZNA-SIP-' || v_yil || '-' || lpad((v_son_no + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_siparis_no_uret on siparisler;
create trigger tr_siparis_no_uret
  before insert on siparisler
  for each row
  execute function siparis_no_uret();

-- ==================== GÜNCELLEME TARİHİ ====================
create or replace function siparisler_guncelleme_tetikleyici()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists tr_siparisler_guncelleme on siparisler;
create trigger tr_siparisler_guncelleme
  before update on siparisler
  for each row execute function siparisler_guncelleme_tetikleyici();

-- ==================== RLS ====================
alter table siparisler enable row level security;
alter table siparis_kalemleri enable row level security;

drop policy if exists siparisler_staff on siparisler;
create policy siparisler_staff on siparisler
  for all using (is_staff()) with check (is_staff());

drop policy if exists siparis_kalemleri_staff on siparis_kalemleri;
create policy siparis_kalemleri_staff on siparis_kalemleri
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
