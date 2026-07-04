-- 084_arac_foto_takip.sql
-- Şirket araçları + günlük foto kayıt takibi (sabah/akşam, 6 bölge)

-- Şirket araç listesi
create table if not exists sirket_araclari (
  id uuid primary key default gen_random_uuid(),
  plaka text not null unique,
  marka text,
  model text,
  yil integer,
  aktif boolean not null default true,
  not_ text,
  yaratma_zamani timestamptz not null default now()
);

-- Foto kayıt tablosu
-- bolge: 'on', 'arka', 'sol', 'sag', 'kokpit' (ön konsol), 'ic' (araba içi)
-- zaman: 'sabah', 'aksam'
create table if not exists arac_foto_kayitlari (
  id uuid primary key default gen_random_uuid(),
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  teknisyen_id bigint not null references kullanicilar(id) on delete cascade,
  tarih date not null default (now() at time zone 'Europe/Istanbul')::date,
  zaman text not null check (zaman in ('sabah','aksam')),
  bolge text not null check (bolge in ('on','arka','sol','sag','kokpit','ic')),
  foto_url text not null,
  cekim_zamani timestamptz not null default now(),
  notlar text
);

-- Aynı gün + zaman + bölge için bir teknisyen tek kayıt açabilsin (yenisi eskisinin üstüne yazsın istersek update ile)
create unique index if not exists arac_foto_tek
  on arac_foto_kayitlari(arac_id, tarih, zaman, bolge);

create index if not exists arac_foto_tarih_idx
  on arac_foto_kayitlari(tarih desc, arac_id);

create index if not exists arac_foto_teknisyen_idx
  on arac_foto_kayitlari(teknisyen_id, tarih desc);

-- RLS: teknisyen kendi çektiklerini okur/yazar; Ali/Oğuz + admin hepsini görür
alter table sirket_araclari enable row level security;
drop policy if exists arac_okur on sirket_araclari;
create policy arac_okur on sirket_araclari for select to authenticated using (true);
drop policy if exists arac_yonetim_yazar on sirket_araclari;
create policy arac_yonetim_yazar on sirket_araclari for all using (
  exists (select 1 from kullanicilar where auth_id = auth.uid()
          and (rol = 'admin' or ad ~* '\m(oğuz|oguz|ali)\M'))
);

alter table arac_foto_kayitlari enable row level security;

drop policy if exists arac_foto_okur on arac_foto_kayitlari;
create policy arac_foto_okur on arac_foto_kayitlari for select using (
  exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid()
      and (k.id = arac_foto_kayitlari.teknisyen_id
           or k.rol = 'admin'
           or k.ad ~* '\m(oğuz|oguz|ali)\M')
  )
);

-- Insert: sadece kendi teknisyen_id'si için
drop policy if exists arac_foto_ekle on arac_foto_kayitlari;
create policy arac_foto_ekle on arac_foto_kayitlari for insert to authenticated with check (
  teknisyen_id = (select id from kullanicilar where auth_id = auth.uid())
);

-- Update: kendi kaydını değiştirebilir (yeni foto ile üzerine yazma)
drop policy if exists arac_foto_guncelle on arac_foto_kayitlari;
create policy arac_foto_guncelle on arac_foto_kayitlari for update using (
  teknisyen_id = (select id from kullanicilar where auth_id = auth.uid())
);

-- Modül dağıtımı: teknisyen + Ferdi + Ali + Oğuz
update kullanicilar
set moduller = array_append(coalesce(moduller, '{}'), 'arac_foto_takip')
where not ('arac_foto_takip' = any(coalesce(moduller, '{}')))
  and (rol = 'admin'
       or ad ~* '\m(ferdi|ali|oğuz|oguz)\M'
       or unvan ~* '(teknisyen)');

notify pgrst, 'reload schema';
