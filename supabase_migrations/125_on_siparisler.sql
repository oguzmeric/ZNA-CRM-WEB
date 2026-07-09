-- 125: Ön Sipariş Modülü — fiyatsız talep kaydı.
--
-- KRİTİK: Fiyat kolonu YOK. Ön sipariş, müşterinin görüşmeden doğan talebini
-- sipariş onay akışına taşır. Fiyatlandırma Sipariş Onayı ekranında yapılır.
--
-- Her ön sipariş bir görüşmeye bağlıdır (gorusme_id NOT NULL).
-- Her ön siparişe OS-YYYY-NNNNNN formatında no atanır.
--
-- Faz 2/5.
-- Bkz: promt "Ön Sipariş ekranında fiyat girişi yapılmayacaktır. Ön sipariş,
-- fiyatlandırma ekranı değildir."

-- ==================== ANA TABLO ====================
create table if not exists on_siparisler (
  id             bigserial primary key,
  on_siparis_no  text unique,                                        -- OS-2026-000001
  gorusme_id     bigint not null references gorusmeler(id) on delete restrict,
  musteri_id     bigint references musteriler(id) on delete set null,
  lokasyon_id    bigint,  -- FK aşağıda koşullu eklenir (musteri_lokasyonlari bazı kurulumlarda yok)
  ilgili_kisi    text,                                               -- muhatap adı
  aciklama       text,                                               -- ihtiyaç notu / genel açıklama
  aciliyet       text not null default 'orta'
                 check (aciliyet in ('dusuk','orta','yuksek')),
  musteri_onay_bilgisi text,                                         -- "Telefonda onayladı", "WhatsApp'ta yazılı onay" vb.
  durum          text not null default 'taslak'
                 check (durum in ('taslak','onay_bekliyor','siparise_donustu','iptal')),
  -- Bağlantılar (kayıt takibi)
  siparis_id     bigint,                                             -- siparise_donustu iken doldurulur (F3'te siparisler tablosu eklenecek)
  -- Audit
  olusturan_id   bigint references kullanicilar(id) on delete set null,
  iptal_sebebi   text,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

-- Koşullu FK: musteri_lokasyonlari tablosu varsa referans kur
do $$
begin
  if to_regclass('public.musteri_lokasyonlari') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'on_siparisler_lokasyon_fk'
    ) then
      alter table on_siparisler
        add constraint on_siparisler_lokasyon_fk
        foreign key (lokasyon_id) references musteri_lokasyonlari(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists on_siparisler_gorusme_idx on on_siparisler (gorusme_id);
create index if not exists on_siparisler_musteri_idx on on_siparisler (musteri_id);
create index if not exists on_siparisler_durum_idx   on on_siparisler (durum);
create index if not exists on_siparisler_no_idx      on on_siparisler (on_siparis_no) where on_siparis_no is not null;

-- ==================== KALEMLER (fiyatsız) ====================
create table if not exists on_siparis_kalemleri (
  id             bigserial primary key,
  on_siparis_id  bigint not null references on_siparisler(id) on delete cascade,
  -- Ürün: stoktan seçilebilir veya manuel yazılabilir
  stok_kodu      text,                                               -- stok_urunler.stok_kodu (opsiyonel)
  urun_ad        text not null,                                      -- ürün adı (zorunlu)
  urun_marka     text,
  urun_model     text,
  kategori       text,
  -- Miktar
  miktar         numeric(12,3) not null check (miktar > 0),
  birim          text not null default 'Adet',
  -- Not
  aciklama       text,
  siralama       int default 0,
  olusturma_tarih timestamptz not null default now()
  -- FIYAT KOLONU BİLE YOK — mühürlü tasarım. Fiyat Sipariş Onayı ekranında.
);

create index if not exists on_siparis_kalemleri_siparis_idx on on_siparis_kalemleri (on_siparis_id);
create index if not exists on_siparis_kalemleri_stok_idx    on on_siparis_kalemleri (stok_kodu) where stok_kodu is not null;

-- ==================== NUMARA ÜRETİCİ ====================
-- Pattern: teklif_no / gorusme_no ile aynı — yıllık max+1
create or replace function on_siparis_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son_no int;
  v_pattern text;
begin
  if new.on_siparis_no is not null and new.on_siparis_no <> '' then
    return new;
  end if;

  v_pattern := '^OS-' || v_yil || '-(\d+)$';
  select coalesce(
    max(substring(on_siparis_no from v_pattern)::int),
    0
  ) into v_son_no
  from on_siparisler
  where on_siparis_no ~ v_pattern;

  new.on_siparis_no := 'OS-' || v_yil || '-' || lpad((v_son_no + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_on_siparis_no_uret on on_siparisler;
create trigger tr_on_siparis_no_uret
  before insert on on_siparisler
  for each row
  execute function on_siparis_no_uret();

-- ==================== GÜNCELLEME TARİHİ ====================
create or replace function on_siparisler_guncelleme_tetikleyici()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists tr_on_siparisler_guncelleme on on_siparisler;
create trigger tr_on_siparisler_guncelleme
  before update on on_siparisler
  for each row
  execute function on_siparisler_guncelleme_tetikleyici();

-- ==================== RLS ====================
alter table on_siparisler enable row level security;
alter table on_siparis_kalemleri enable row level security;

-- is_staff() fonksiyonu mevcut sistemde var; onu kullanıyoruz.
drop policy if exists on_siparisler_staff on on_siparisler;
create policy on_siparisler_staff on on_siparisler
  for all
  using (is_staff())
  with check (is_staff());

drop policy if exists on_siparis_kalemleri_staff on on_siparis_kalemleri;
create policy on_siparis_kalemleri_staff on on_siparis_kalemleri
  for all
  using (is_staff())
  with check (is_staff());

notify pgrst, 'reload schema';
