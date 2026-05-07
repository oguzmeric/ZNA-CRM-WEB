-- 030_demolar.sql — Demo cihaz takibi
-- demo_cihazlari: havuzdaki fiziksel cihazlar
-- demo_zimmet_kayitlari: her ödünç verme/alma olayı

create table if not exists demo_cihazlari (
  id              bigserial primary key,
  ad              text not null,
  marka           text,
  model           text,
  seri_no         text,
  kategori        text,
  foto_url        text,
  bakimda         boolean default false,
  notlar          text,
  olusturma_tarih timestamptz default now()
);

create index if not exists demo_cihazlari_ad_idx on demo_cihazlari (ad);
create index if not exists demo_cihazlari_seri_no_idx on demo_cihazlari (seri_no);

create table if not exists demo_zimmet_kayitlari (
  id                              bigserial primary key,
  cihaz_id                        bigint references demo_cihazlari(id) on delete cascade not null,
  musteri_id                      bigint references musteriler(id) not null,
  lokasyon_id                     bigint references musteri_lokasyonlari(id),
  veren_kullanici_id              text,
  veren_kullanici_ad              text,
  veris_tarihi                    date not null default current_date,
  beklenen_iade_tarihi            date not null,
  gercek_iade_tarihi              date,
  musteri_karari                  text check (musteri_karari in ('aldi','almadi','degerlendiriyor')),
  durum_notu                      text,
  uyari3gun_kala_gonderildi       boolean default false,
  uyari_suresi_gecti_son_gonderim date,
  olusturma_tarih                 timestamptz default now()
);

create index if not exists demo_zimmet_aktif_idx
  on demo_zimmet_kayitlari (cihaz_id) where gercek_iade_tarihi is null;
create index if not exists demo_zimmet_musteri_idx
  on demo_zimmet_kayitlari (musteri_id);

create or replace view demo_cihazlari_durum as
select
  c.*,
  z.id            as aktif_zimmet_id,
  z.musteri_id    as aktif_musteri_id,
  z.lokasyon_id   as aktif_lokasyon_id,
  z.veris_tarihi,
  z.beklenen_iade_tarihi,
  z.veren_kullanici_ad,
  case
    when c.bakimda then 'bakimda'
    when z.id is null then 'depoda'
    when z.beklenen_iade_tarihi >= current_date then 'musteride'
    else 'suresi_gecti'
  end as hesaplanan_durum,
  case when z.id is not null
       then current_date - z.veris_tarihi
       else null
  end as gecen_gun
from demo_cihazlari c
left join demo_zimmet_kayitlari z
  on z.cihaz_id = c.id and z.gercek_iade_tarihi is null;

alter table demo_cihazlari enable row level security;
alter table demo_zimmet_kayitlari enable row level security;
drop policy if exists demo_cihazlari_select on demo_cihazlari;
drop policy if exists demo_cihazlari_modify on demo_cihazlari;
drop policy if exists demo_zimmet_select on demo_zimmet_kayitlari;
drop policy if exists demo_zimmet_modify on demo_zimmet_kayitlari;
create policy demo_cihazlari_select on demo_cihazlari for select using (true);
create policy demo_cihazlari_modify on demo_cihazlari for all using (true) with check (true);
create policy demo_zimmet_select on demo_zimmet_kayitlari for select using (true);
create policy demo_zimmet_modify on demo_zimmet_kayitlari for all using (true) with check (true);

notify pgrst, 'reload schema';
