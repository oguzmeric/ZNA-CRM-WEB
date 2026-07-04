-- 083_mesai_takip.sql
-- Teknisyen/depo mesai giriş-çıkış logu — ofis QR + GPS ile giriş, tek buton çıkış.

-- 1) Ofis konumu (tek satır, sabit UUID — QR bu ID ile üretildi)
create table if not exists ofis_konumu (
  id uuid primary key default gen_random_uuid(),
  ad text not null default 'Merkez Ofis',
  lat numeric(10,7),
  lng numeric(10,7),
  tolerans_metre integer not null default 150,
  guncelleme_zamani timestamptz not null default now()
);

insert into ofis_konumu (id, ad, tolerans_metre)
values ('11111111-2222-3333-4444-555555555555', 'Merkez Ofis', 150)
on conflict (id) do nothing;

-- 2) Mesai kayıtları
create table if not exists mesai_kayitlari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id bigint not null references kullanicilar(id) on delete cascade,
  giris_zamani timestamptz not null default now(),
  giris_lat numeric(10,7),
  giris_lng numeric(10,7),
  giris_mesafe_m integer,
  cikis_zamani timestamptz,
  cikis_lat numeric(10,7),
  cikis_lng numeric(10,7),
  sure_dakika integer,
  not_ text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mesai_aktif_tek
  on mesai_kayitlari(kullanici_id) where cikis_zamani is null;

create index if not exists mesai_kullanici_tarih
  on mesai_kayitlari(kullanici_id, giris_zamani desc);

-- 3) Trigger: çıkışta sure_dakika hesapla + updated_at
create or replace function mesai_sure_hesapla_fn() returns trigger as $$
begin
  new.updated_at = now();
  if new.cikis_zamani is not null and old.cikis_zamani is null then
    new.sure_dakika = extract(epoch from (new.cikis_zamani - new.giris_zamani))::int / 60;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists mesai_sure_hesapla on mesai_kayitlari;
create trigger mesai_sure_hesapla before update on mesai_kayitlari
  for each row execute function mesai_sure_hesapla_fn();

-- 4) RLS — mesai_kayitlari
alter table mesai_kayitlari enable row level security;

drop policy if exists mesai_kendi_okur on mesai_kayitlari;
create policy mesai_kendi_okur on mesai_kayitlari for select using (
  exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid()
      and (k.id = mesai_kayitlari.kullanici_id
           or k.rol = 'admin'
           or k.ad ~* '\m(oğuz|oguz|ali)\M')
  )
);
-- INSERT/UPDATE policy YOK — sadece service_role (edge function) yazar

-- 5) RLS — ofis_konumu
alter table ofis_konumu enable row level security;

drop policy if exists ofis_okur on ofis_konumu;
create policy ofis_okur on ofis_konumu for select to authenticated using (true);

drop policy if exists ofis_oguz_yazar on ofis_konumu;
create policy ofis_oguz_yazar on ofis_konumu for all using (
  exists (select 1 from kullanicilar where auth_id = auth.uid()
          and ad ~* '\m(oğuz|oguz)\M')
);

-- 6) Modül dağıtımı: teknisyen + depo + Ferdi + Ali + Oğuz
update kullanicilar
set moduller = array_append(coalesce(moduller, '{}'), 'mesai_takip')
where not ('mesai_takip' = any(coalesce(moduller, '{}')))
  and (rol = 'admin'
       or ad ~* '\m(ferdi|ali|oğuz|oguz)\M'
       or unvan ~* '(teknisyen|depo)');

notify pgrst, 'reload schema';
