-- ================================================================
-- ZNA CRM - Supabase Veritabanı Şeması
-- Supabase Dashboard > SQL Editor'a yapıştırıp çalıştırın
-- ================================================================

-- Kullanıcılar (personel + müşteri portalı)
create table if not exists kullanicilar (
  id bigserial primary key,
  ad text not null,
  kullanici_adi text unique not null,
  sifre text not null,
  tip text not null default 'zna',        -- 'zna' | 'musteri'
  moduller text[] default '{}',
  durum text default 'cevrimdisi',
  izinli_turler text[] default '{}',
  firma_adi text,
  silinebilir boolean default true,
  created_at timestamptz default now()
);

-- Müşteriler
create table if not exists musteriler (
  id bigserial primary key,
  ad text not null,
  soyad text not null,
  firma text not null,
  unvan text,
  telefon text not null,
  email text,
  sehir text,
  vergi_no text,
  notlar text,
  durum text default 'lead',
  kod text unique not null,
  olusturma_tarih timestamptz default now()
);

-- Firmalar
create table if not exists firmalar (
  id bigserial primary key,
  firma_adi text not null,
  vergi_no text,
  sektor text,
  telefon text,
  email text,
  adres text,
  sehir text,
  notlar text,
  kod text unique,
  olusturma_tarih timestamptz default now()
);

-- Görüşmeler
create table if not exists gorusmeler (
  id bigserial primary key,
  akt_no text,
  tarih date,
  saat text,
  firma_adi text,
  musteri_adi text,
  konu text,
  notlar text,
  tip text,
  durum text default 'planlandi',
  hazirlayan text,
  olusturma_tarih timestamptz default now()
);

-- Teklifler
create table if not exists teklifler (
  id bigserial primary key,
  teklif_no text unique,
  revizyon int default 0,
  tarih date,
  gecerlilik_tarihi date,
  musteri_id bigint,
  firma_adi text,
  musteri_yetkilisi text,
  hazirlayan text,
  konu text,
  odeme_secenegi text default 'Peşin',
  para_birimi text default 'TL',
  doviz_kuru numeric,
  onay_durumu text default 'takipte',
  gorusme_id bigint,
  aciklama text,
  satirlar jsonb default '[]',
  genel_iskonto numeric default 0,
  genel_toplam numeric default 0,
  musteri_talep_id bigint,
  musteri_talep_no text,
  olusturma_tarih timestamptz default now()
);

-- Servis Talepleri
create table if not exists servis_talepleri (
  id bigserial primary key,
  talep_no text unique,
  musteri_id bigint,
  musteri_ad text,
  firma_adi text,
  ana_tur text,
  alt_kategori text,
  konu text,
  lokasyon text,
  cihaz_turu text,
  aciklama text,
  aciliyet text default 'normal',
  ilgili_kisi text,
  telefon text,
  uygun_zaman text,
  durum text default 'bekliyor',
  atanan_kullanici_id bigint,
  atanan_kullanici_ad text,
  planli_tarih date,
  notlar jsonb default '[]',
  durum_gecmisi jsonb default '[]',
  musteri_onay boolean,
  olusturma_tarihi timestamptz default now(),
  guncelleme_tarihi timestamptz default now()
);

-- Kargolar
create table if not exists kargolar (
  id bigserial primary key,
  takip_no text,
  firma_adi text,
  alici_ad text,
  alici_telefon text,
  alici_adres text,
  urunler jsonb default '[]',
  kargo_firmasi text,
  durum text default 'hazirlaniyor',
  notlar text,
  olusturma_tarih timestamptz default now(),
  guncelleme_tarih timestamptz default now()
);

-- Stok Ürünleri
create table if not exists stok_urunler (
  id bigserial primary key,
  stok_kodu text unique not null,
  stok_adi text not null,
  kategori text,
  birim text default 'Adet',
  stok_miktari numeric default 0,
  min_stok numeric default 0,
  birim_fiyat numeric default 0,
  kdv_orani int default 20,
  aciklama text,
  olusturma_tarih timestamptz default now()
);

-- Stok Hareketleri
create table if not exists stok_hareketleri (
  id bigserial primary key,
  stok_kodu text,
  stok_adi text,
  hareket_tipi text,   -- 'giris' | 'cikis' | 'sayim'
  miktar numeric,
  onceki_miktar numeric,
  sonraki_miktar numeric,
  aciklama text,
  kullanici_ad text,
  tarih timestamptz default now()
);

-- Görevler
create table if not exists gorevler (
  id bigserial primary key,
  baslik text not null,
  aciklama text,
  durum text default 'bekliyor',
  oncelik text default 'normal',
  atanan_id bigint,
  atanan_ad text,
  olusturan_ad text,
  bitis_tarihi date,
  tamamlanma_tarihi timestamptz,
  firma_adi text,
  musteri_id bigint,
  olusturma_tarih timestamptz default now()
);

-- TRASSIR Lisanslar
create table if not exists trassir_lisanslar (
  id bigserial primary key,
  firma_adi text,
  musteri_id bigint,
  lisans_no text unique,
  lisans_turu text,
  baslangic_tarihi date,
  bitis_tarihi date,
  durum text default 'aktif',
  kamera_sayisi int,
  notlar text,
  olusturma_tarih timestamptz default now()
);

-- Hatırlatmalar
create table if not exists hatirlatmalar (
  id bigserial primary key,
  teklif_id bigint,
  teklif_no text,
  firma_adi text,
  konu text,
  hatirlatma_tarihi timestamptz,
  olusturma_tarih timestamptz default now(),
  durum text default 'bekliyor',
  gun_sayisi int,
  tamamlanma_tarihi timestamptz
);

-- Müşteri Teklif Talepleri (portaldaki teklif istekleri)
create table if not exists musteri_teklif_talepleri (
  id bigserial primary key,
  talep_no text unique,
  firma_adi text,
  iletisim_kisi text,
  urunler jsonb default '[]',
  aciklama text,
  butce text,
  telefon text,
  durum text default 'bekliyor',
  tarih timestamptz default now()
);

-- Aktivite Logu
create table if not exists aktivite_log (
  id bigserial primary key,
  kullanici_id text,
  kullanici_ad text,
  tip text,
  sayfa text,
  sure_saniye int,
  aciklama text,
  tarih timestamptz default now()
);

-- Bildirimler
create table if not exists bildirimler (
  id bigserial primary key,
  kullanici_id text,
  baslik text,
  mesaj text,
  tip text default 'bilgi',
  link text,
  okundu boolean default false,
  tarih timestamptz default now()
);

-- Sistem Ayarları (tek satır)
create table if not exists sistem_ayarlari (
  id int primary key default 1,
  datasheet_url text,
  destek_telefon text,
  destek_email text,
  updated_at timestamptz default now()
);

-- Varsayılan admin kullanıcısını ekle
insert into kullanicilar (ad, kullanici_adi, sifre, tip, moduller, silinebilir)
values (
  'Genel Müdür',
  'admin',
  '1234',
  'zna',
  ARRAY['musteriler','gorevler','gorusmeler','stok','lisanslar','raporlar','kullanici_yonetimi','servis_talepleri'],
  false
)
on conflict (kullanici_adi) do nothing;

-- Varsayılan sistem ayarları
insert into sistem_ayarlari (id) values (1) on conflict (id) do nothing;

-- ================================================================
-- Row Level Security (RLS) - ileride auth entegrasyonu için
-- Şimdilik kapalı tutuyoruz, tüm işlemler anon key ile yapılacak
-- ================================================================
alter table kullanicilar disable row level security;
alter table musteriler disable row level security;
alter table firmalar disable row level security;
alter table gorusmeler disable row level security;
alter table teklifler disable row level security;
alter table servis_talepleri disable row level security;
alter table kargolar disable row level security;
alter table stok_urunler disable row level security;
alter table stok_hareketleri disable row level security;
alter table gorevler disable row level security;
alter table trassir_lisanslar disable row level security;
alter table hatirlatmalar disable row level security;
alter table musteri_teklif_talepleri disable row level security;
alter table aktivite_log disable row level security;
alter table bildirimler disable row level security;
alter table sistem_ayarlari disable row level security;
