-- 124: Sipariş Talep Modülü — Çekirdek (Faz 1)
-- Konsept: müşteri kalem talep eder → firma tedarik eder + satar. Kâr = satış − alış.
-- Sipariş = durum makinesi (kara düzenin panzehiri).
-- Bkz: siparis-talep-modulu-spec_1.md

-- ==================== DURUM ENUM ====================
do $$ begin
  create type siparis_durum as enum (
    'GORUSME_TALEBI',    -- henüz sipariş no yok, sadece görüşme kaydı
    'ON_SIPARIS',        -- numara atandı, kalemler taslak/fiyatlar oluşuyor
    'ONAY_BEKLIYOR',     -- fiyatlar hazır, yönetim onayı bekliyor
    'ONAYLANDI',         -- yürütmeye alındı
    'TEDARIK',           -- ürünler tedarik ediliyor
    'SEVK_TESLIM',       -- teslim edildi (tamamen)
    'KISMI_TESLIM',      -- kısmen teslim, kalan var
    'FATURALANDI',       -- fatura kesildi
    'KAPANDI',           -- tahsilat tamam, iş bitti
    'IPTAL'              -- her aşamada mümkün, gerekçe zorunlu
  );
exception when duplicate_object then null; end $$;

-- ==================== SIPARIS BAŞLIĞI ====================
create table if not exists siparisler (
  id bigserial primary key,
  siparis_no text unique,                 -- SIP-2026-000123 formatı (GORUSME_TALEBI'nde NULL)
  musteri_id bigint not null references musteriler(id) on delete restrict,
  durum siparis_durum not null default 'GORUSME_TALEBI',
  -- Tarihler
  talep_tarihi timestamptz not null default now(),  -- görüşme/talep anı
  on_siparis_tarihi timestamptz,                    -- numara atandığı an
  onay_tarihi timestamptz,
  termin_tarihi date,                               -- söz verilen teslim
  kapanma_tarihi timestamptz,
  -- İçerik
  konu text,                                        -- örn "Depo alarm modernizasyonu"
  notlar text,
  iskonto_orani numeric(5,2) default 0,             -- başlık seviyesi iskonto %
  iskonto_tutari numeric(14,2) default 0,           -- veya tutar
  -- Bağlantılar (geldiği yer)
  gorusme_id bigint references gorusmeler(id) on delete set null,
  teklif_id bigint references teklifler(id) on delete set null,
  -- Audit
  olusturan_id bigint references kullanicilar(id) on delete set null,
  onaylayan_id bigint references kullanicilar(id) on delete set null,
  iptal_sebebi text,
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

create index if not exists siparisler_musteri_idx on siparisler (musteri_id);
create index if not exists siparisler_durum_idx on siparisler (durum);
create index if not exists siparisler_no_idx on siparisler (siparis_no) where siparis_no is not null;
create index if not exists siparisler_termin_idx on siparisler (termin_tarihi) where termin_tarihi is not null;

-- ==================== SIPARIŞ KALEMLERİ ====================
create table if not exists siparis_kalemleri (
  id bigserial primary key,
  siparis_id bigint not null references siparisler(id) on delete cascade,
  -- Ürün (katalog VEYA serbest metin — bazı özel işler)
  stok_kodu text,                                  -- stok_urunler.stok_kodu (opsiyonel)
  urun_ad text not null,                           -- görüntü ve serbest metin fallback
  urun_marka text,
  urun_model text,
  birim text not null default 'Adet',
  -- Fiyatlar
  miktar numeric(12,3) not null check (miktar > 0),
  alis_birim_fiyat numeric(14,2) not null default 0,
  satis_birim_fiyat numeric(14,2) not null default 0,
  iskonto_orani numeric(5,2) default 0,            -- kalem seviyesi iskonto %
  -- Teslimat
  teslim_edilen_miktar numeric(12,3) not null default 0,
  kalem_durumu text not null default 'bekliyor'
    check (kalem_durumu in ('bekliyor', 'tedarik_edildi', 'teslim_edildi')),
  -- Audit
  siralama int default 0,
  aciklama text,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists siparis_kalemleri_siparis_idx on siparis_kalemleri (siparis_id);
create index if not exists siparis_kalemleri_stok_kodu_idx on siparis_kalemleri (stok_kodu) where stok_kodu is not null;

-- ==================== DURUM GEÇİŞ LOGU (denetim izi) ====================
create table if not exists siparis_durum_gecmisi (
  id bigserial primary key,
  siparis_id bigint not null references siparisler(id) on delete cascade,
  eski_durum siparis_durum,
  yeni_durum siparis_durum not null,
  degistiren_id bigint references kullanicilar(id) on delete set null,
  gerekce text,
  olusturma_tarih timestamptz not null default now()
);
create index if not exists siparis_durum_gecmisi_siparis_idx on siparis_durum_gecmisi (siparis_id);

-- ==================== siparis_no atama ====================
-- Yıllık sequence: SIP-2026-000001, SIP-2026-000002 ...
create sequence if not exists siparis_no_seq_2026 start 1;
create sequence if not exists siparis_no_seq_2027 start 1;
create sequence if not exists siparis_no_seq_2028 start 1;

create or replace function siparis_no_uret()
returns text language plpgsql as $$
declare
  y int := extract(year from now())::int;
  seq_name text := 'siparis_no_seq_' || y;
  n bigint;
begin
  -- Sequence yoksa oluştur (2029+ için)
  execute format('create sequence if not exists %I start 1', seq_name);
  execute format('select nextval(%L)', seq_name) into n;
  return 'SIP-' || y || '-' || lpad(n::text, 6, '0');
end;
$$;

-- ==================== TRIGGER'lar ====================

-- guncelleme_tarih auto
create or replace function siparis_guncelleme_tetikleyici()
returns trigger language plpgsql as $$
begin new.guncelleme_tarih := now(); return new; end;
$$;
drop trigger if exists siparisler_guncelleme_trg on siparisler;
create trigger siparisler_guncelleme_trg before update on siparisler
  for each row execute function siparis_guncelleme_tetikleyici();

-- Durum geçiş logu + tarih otomasyonu
-- - ON_SIPARIS'e geçince siparis_no ve on_siparis_tarihi doldur
-- - ONAYLANDI'ya geçince onay_tarihi
-- - KAPANDI'ya geçince kapanma_tarihi
create or replace function siparis_durum_gecis_tetikleyici()
returns trigger language plpgsql as $$
declare
  _kul_id bigint := null;
begin
  -- Session'dan kullanıcıyı çekmeye çalış (frontend audit için)
  begin _kul_id := current_setting('app.current_user_id', true)::bigint; exception when others then null; end;

  if TG_OP = 'INSERT' then
    insert into siparis_durum_gecmisi (siparis_id, eski_durum, yeni_durum, degistiren_id, gerekce)
    values (new.id, null, new.durum, coalesce(_kul_id, new.olusturan_id), 'Yeni sipariş açıldı');
    return new;
  end if;

  -- Aynı durum → log yazma
  if new.durum = old.durum then return new; end if;

  -- Otomatik tarih dolduma
  if new.durum = 'ON_SIPARIS' and old.durum = 'GORUSME_TALEBI' then
    if new.siparis_no is null then new.siparis_no := siparis_no_uret(); end if;
    if new.on_siparis_tarihi is null then new.on_siparis_tarihi := now(); end if;
  end if;
  if new.durum = 'ONAYLANDI' and new.onay_tarihi is null then
    new.onay_tarihi := now();
    new.onaylayan_id := coalesce(_kul_id, new.onaylayan_id);
  end if;
  if new.durum = 'KAPANDI' and new.kapanma_tarihi is null then
    new.kapanma_tarihi := now();
  end if;

  -- Log yaz
  insert into siparis_durum_gecmisi (siparis_id, eski_durum, yeni_durum, degistiren_id, gerekce)
  values (new.id, old.durum, new.durum, coalesce(_kul_id, new.onaylayan_id), new.iptal_sebebi);

  return new;
end;
$$;

drop trigger if exists siparisler_durum_gecis_trg on siparisler;
create trigger siparisler_durum_gecis_trg
  after insert or update of durum on siparisler
  for each row execute function siparis_durum_gecis_tetikleyici();

-- ==================== TÜRETİLEN VIEW: sipariş toplamları ====================
create or replace view v_siparis_toplamlari as
select
  s.id as siparis_id,
  s.siparis_no,
  s.musteri_id,
  s.durum,
  coalesce(sum(k.miktar * k.satis_birim_fiyat * (1 - coalesce(k.iskonto_orani,0)/100)), 0) as toplam_satis,
  coalesce(sum(k.miktar * k.alis_birim_fiyat), 0) as toplam_alis,
  coalesce(sum(k.miktar * (k.satis_birim_fiyat * (1 - coalesce(k.iskonto_orani,0)/100) - k.alis_birim_fiyat)), 0)
    - coalesce(s.iskonto_tutari, 0) as toplam_kar,
  count(k.id) as kalem_sayisi
from siparisler s
left join siparis_kalemleri k on k.siparis_id = s.id
group by s.id;

-- ==================== RLS ====================
alter table siparisler enable row level security;
alter table siparis_kalemleri enable row level security;
alter table siparis_durum_gecmisi enable row level security;

-- Tüm staff okuyabilir/yazabilir (kâr/marj görünürlüğü UI katmanında)
-- İleride kalem alış fiyatı için ek policy eklenebilir.
drop policy if exists siparisler_staff on siparisler;
create policy siparisler_staff on siparisler for all
  using (is_staff()) with check (is_staff());

drop policy if exists siparis_kalemleri_staff on siparis_kalemleri;
create policy siparis_kalemleri_staff on siparis_kalemleri for all
  using (is_staff()) with check (is_staff());

drop policy if exists siparis_durum_gecmisi_staff on siparis_durum_gecmisi;
create policy siparis_durum_gecmisi_staff on siparis_durum_gecmisi for select
  using (is_staff());

notify pgrst, 'reload schema';
