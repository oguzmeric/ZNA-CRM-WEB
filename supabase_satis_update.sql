-- Satışlar tablosu
create table if not exists satislar (
  id uuid primary key default gen_random_uuid(),
  fatura_no text unique not null,
  musteri_id uuid,
  firma_adi text,
  musteri_yetkili text,
  musteri_email text,
  musteri_telefon text,
  fatura_tarihi date default current_date,
  vade_tarihi date,
  durum text default 'taslak',
  para_birimi text default 'TRY',
  ara_toplam numeric(14,2) default 0,
  iskonto_toplam numeric(14,2) default 0,
  kdv_toplam numeric(14,2) default 0,
  genel_toplam numeric(14,2) default 0,
  odenen_toplam numeric(14,2) default 0,
  notlar text,
  teklif_id uuid,
  teklif_no text,
  olusturan_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Satır kalemleri
create table if not exists satis_satirlari (
  id uuid primary key default gen_random_uuid(),
  satis_id uuid references satislar(id) on delete cascade,
  stok_kodu text,
  urun_adi text not null,
  aciklama text,
  miktar numeric(10,3) default 1,
  birim text default 'Adet',
  birim_fiyat numeric(14,2) default 0,
  iskonto_oran numeric(5,2) default 0,
  kdv_oran numeric(5,2) default 20,
  ara_toplam numeric(14,2) default 0,
  kdv_tutar numeric(14,2) default 0,
  satir_toplam numeric(14,2) default 0,
  sira integer default 0
);

-- Tahsilatlar
create table if not exists tahsilatlar (
  id uuid primary key default gen_random_uuid(),
  satis_id uuid references satislar(id) on delete cascade,
  tarih date default current_date,
  tutar numeric(14,2) not null,
  odeme_yontemi text default 'banka',
  aciklama text,
  created_at timestamptz default now()
);

-- RLS
alter table satislar enable row level security;
alter table satis_satirlari enable row level security;
alter table tahsilatlar enable row level security;

drop policy if exists "auth satislar all" on satislar;
create policy "auth satislar all" on satislar for all using (auth.role() = 'authenticated');

drop policy if exists "auth satis_satirlari all" on satis_satirlari;
create policy "auth satis_satirlari all" on satis_satirlari for all using (auth.role() = 'authenticated');

drop policy if exists "auth tahsilatlar all" on tahsilatlar;
create policy "auth tahsilatlar all" on tahsilatlar for all using (auth.role() = 'authenticated');
