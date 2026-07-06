-- ═══════════════════════════════════════════════════════════════
-- Filo Yönetimi — bakım, belge, yakıt, KM otomasyonu
-- ═══════════════════════════════════════════════════════════════

-- sirket_araclari tablosuna filo alanları ekle
alter table sirket_araclari
  add column if not exists guncel_km integer,
  add column if not exists guncel_km_zamani timestamptz,
  add column if not exists sonraki_bakim_km integer,
  add column if not exists sonraki_bakim_tarih date,
  add column if not exists bakim_araligi_km integer default 10000,
  add column if not exists muayene_bitis date,
  add column if not exists sigorta_bitis date,
  add column if not exists kasko_bitis date,
  add column if not exists yakit_tipi text,  -- benzin/dizel/lpg/elektrik
  add column if not exists motor_hacmi text,
  add column if not exists surucu_kullanici_id bigint references kullanicilar(id) on delete set null,
  add column if not exists mobiltek_id integer,  -- Mobiltek'teki araç ID (auto-KM sync için)
  add column if not exists satin_alma_tarih date,
  add column if not exists satin_alma_tutari numeric(12,2),
  add column if not exists ruhsat_no text;

create index if not exists sirket_araclari_mobiltek_idx on sirket_araclari (mobiltek_id) where mobiltek_id is not null;

-- ─── Bakım geçmişi ─────────────────────────────────────────────
create table if not exists arac_bakim_kayitlari (
  id bigserial primary key,
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  tarih date not null default current_date,
  km integer,
  bakim_tipi text not null,  -- periyodik, motor, lastik, fren, aku, sanziman, kaporta, diger
  aciklama text,
  tutar numeric(12,2),
  servis_adi text,
  sonraki_bakim_km integer,
  sonraki_bakim_tarih date,
  fatura_no text,
  fatura_url text,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_zamani timestamptz not null default now()
);
create index if not exists arac_bakim_arac_idx on arac_bakim_kayitlari (arac_id, tarih desc);

-- ─── Belgeler (muayene, sigorta, kasko, ruhsat, egzoz, vs.) ───
create table if not exists arac_belgeleri (
  id bigserial primary key,
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  belge_tipi text not null,  -- muayene, sigorta, kasko, ruhsat, egzoz, ohsas, diger
  belge_no text,
  baslangic_tarih date,
  bitis_tarih date,
  tutar numeric(12,2),
  saglayici text,  -- sigorta şirketi, muayene istasyonu vb.
  dosya_url text,
  notlar text,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_zamani timestamptz not null default now()
);
create index if not exists arac_belge_arac_idx on arac_belgeleri (arac_id, bitis_tarih);

-- ─── Yakıt fişleri ─────────────────────────────────────────────
create table if not exists arac_yakit_kayitlari (
  id bigserial primary key,
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  tarih date not null default current_date,
  km integer,
  litre numeric(8,2),
  birim_fiyat numeric(8,3),
  tutar numeric(12,2),
  istasyon text,
  yakit_tipi text,
  fis_no text,
  fis_url text,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_zamani timestamptz not null default now()
);
create index if not exists arac_yakit_arac_idx on arac_yakit_kayitlari (arac_id, tarih desc);

-- ─── Hatırlatıcı log (aynı gün spam etmesin) ──────────────────
create table if not exists arac_bakim_bildirim_log (
  id bigserial primary key,
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  bildirim_tipi text not null,  -- bakim, muayene, sigorta, kasko
  tarih date not null default current_date,
  detay jsonb
);
create unique index if not exists arac_bakim_bildirim_uniq
  on arac_bakim_bildirim_log (arac_id, bildirim_tipi, tarih);

-- ─── RLS: hepsi staff-only ─────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['arac_bakim_kayitlari', 'arac_belgeleri', 'arac_yakit_kayitlari', 'arac_bakim_bildirim_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, public', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('create policy "%s_staff_all" on %I for all using (is_staff()) with check (is_staff())', t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
