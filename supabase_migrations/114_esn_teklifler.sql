-- 114: esnweb tekliflerini yansıtan iki tablo
-- Başlık: esn_teklifler (1 satır per teklif)
-- Kalemler: esn_teklif_kalemleri (n satır per teklif)
-- esnweb'in kendi FISNO'su primary key. Fiyatlar döviz cinsinden (dovkod='D' Dolar).

create table if not exists esn_teklifler (
  fisno bigint primary key,             -- esnweb primary key
  evrak_no text,                        -- görünen teklif no (2335)
  tarih date,                           -- teklif tarihi
  firma_adi text,
  cari_kodu text,                       -- KODU / PKEYKODU
  teklif_konusu text,
  hazirlayan text,
  temsilci text,                        -- pkodu kalemlerden veya HAZIRLAYAN
  aciklama text,
  odeme_sekli text,
  teslim_yeri text,
  teslim_tarihi date,
  onay_durumu text,                     -- ONYKD / onaykodu
  tek_kabul text,                       -- TEKKABUL H/E
  kabul_tarihi date,
  kabul_eden text,
  teslim_edildi text,                   -- H/E
  vazgecildi text,                      -- H/E
  vazgec_sebep text,
  rakip_sat text,                       -- H/E
  rakip_sat_sebep text,
  revizyon text,                        -- H/E
  fis_turu text,                        -- Verilen
  dovkod text,                          -- D (Dolar), TL, EUR
  usd_kur numeric(12,4),
  euro_kur numeric(12,4),
  sterlin_kur numeric(12,4),
  gecerlilik_tarihi date,
  toplam_tutar numeric(14,2),           -- toptutar
  iskonto_tutar numeric(14,2),          -- isktutar
  ara_tutar numeric(14,2),              -- aratutar (iskonto sonrası, kdv öncesi)
  kdv_toplam numeric(14,2),             -- kdvtop
  genel_toplam numeric(14,2),           -- gentop
  genel_toplam_dov numeric(14,2),       -- GENTOPC (döviz karşılığı)
  ham_json jsonb,                       -- ileride yeni alanlar için ham response
  silindi boolean not null default false,
  senkron_zamani timestamptz not null default now(),
  olusturuldu timestamptz not null default now()
);

create index if not exists esn_teklifler_tarih_idx on esn_teklifler (tarih desc);
create index if not exists esn_teklifler_firma_idx on esn_teklifler (firma_adi);
create index if not exists esn_teklifler_temsilci_idx on esn_teklifler (temsilci);
create index if not exists esn_teklifler_silindi_idx on esn_teklifler (silindi) where silindi = false;

create table if not exists esn_teklif_kalemleri (
  id uuid primary key default gen_random_uuid(),
  fisno bigint not null references esn_teklifler(fisno) on delete cascade,
  refno text not null,                  -- esnweb refno (kalem PK)
  stok_kodu text,
  stok_adi text,
  stok_aciklama text,                   -- stokacik
  aciklama text,                        -- kalem seviyesi rich text
  ozel_kod text,
  birim text,                           -- ADET / METRE
  miktar numeric(14,3),
  fiyat numeric(14,4),                  -- birim fiyat (döviz)
  tutar numeric(14,4),                  -- miktar × fiyat (döviz)
  kdv_yuzde numeric(5,2),
  iskonto1_yuzde numeric(5,2),
  iskonto2_yuzde numeric(5,2),
  net_fiyat numeric(14,4),              -- iskonto sonrası birim fiyat (döviz)
  net_tutar numeric(14,4),              -- iskonto sonrası tutar (döviz)
  net_fiyat_tl numeric(14,4),
  net_tutar_tl numeric(14,4),
  dovkod text,
  kur numeric(12,4),
  temsilci text,                        -- pkodu
  dip_fiyat numeric(14,4),
  hedef_fiyat numeric(14,4),
  giris_fiyat numeric(14,4),            -- girfiyat (alış maliyet)
  teslim_tarihi date,
  ham_json jsonb,
  olusturuldu timestamptz not null default now(),
  unique (fisno, refno)
);

create index if not exists esn_kalem_fisno_idx on esn_teklif_kalemleri (fisno);
create index if not exists esn_kalem_stok_idx on esn_teklif_kalemleri (stok_kodu);

-- RLS: sadece authenticated staff okur/yazar
alter table esn_teklifler enable row level security;
alter table esn_teklif_kalemleri enable row level security;

drop policy if exists esn_teklifler_staff_read on esn_teklifler;
create policy esn_teklifler_staff_read on esn_teklifler
  for select to authenticated using (is_staff());

drop policy if exists esn_kalem_staff_read on esn_teklif_kalemleri;
create policy esn_kalem_staff_read on esn_teklif_kalemleri
  for select to authenticated using (is_staff());

-- Yazma: sadece service_role (edge fn). authenticated policy yok — sadece SELECT.

notify pgrst, 'reload schema';
