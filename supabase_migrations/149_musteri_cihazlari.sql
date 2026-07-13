-- 149: Müşteri Cihaz Envanteri
-- Teknisyen sahada müşterinin cihazını SN ile okutup kaydeder (arızalı giriş
-- dahil). MusteriDetay'da "Müşteri Cihazları" bölümünden takip edilir.
-- Cihaz detayı: SN, IP, MAC, kullanıcı adı, şifre, lokasyon + hareket geçmişi.

create table if not exists musteri_cihazlari (
  id bigint generated always as identity primary key,
  musteri_id bigint not null references musteriler(id) on delete cascade,
  lokasyon text,
  cihaz_adi text,                -- "NVR", "Kamera - Depo Girişi" vb.
  marka text,
  model text,
  seri_no text not null,
  ip_adresi text,
  mac_adresi text,
  kullanici_adi text,
  sifre text,
  durum text not null default 'aktif'
    check (durum in ('aktif','arizali','serviste','hurda')),
  ariza_nedeni text,
  ariza_tarihi timestamptz,
  notlar text,
  olusturan_id bigint,
  olusturan_ad text,
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

-- Aynı SN iki kez girilmesin (arızalı girişte çift kayıt engeli)
create unique index if not exists ux_musteri_cihaz_sn on musteri_cihazlari (upper(trim(seri_no)));
create index if not exists ix_musteri_cihaz_musteri on musteri_cihazlari (musteri_id);
create index if not exists ix_musteri_cihaz_durum on musteri_cihazlari (durum);

create table if not exists musteri_cihaz_hareketleri (
  id bigint generated always as identity primary key,
  cihaz_id bigint not null references musteri_cihazlari(id) on delete cascade,
  tip text not null check (tip in ('olusturuldu','ariza','tamir','guncelleme','not')),
  aciklama text,
  yapan_id bigint,
  yapan_ad text,
  tarih timestamptz not null default now()
);
create index if not exists ix_mch_cihaz on musteri_cihaz_hareketleri (cihaz_id, tarih desc);

-- guncelleme_tarih otomatik
create or replace function tg_musteri_cihaz_guncelleme() returns trigger
language plpgsql set search_path = public as $$
begin
  new.guncelleme_tarih := now();
  return new;
end $$;
drop trigger if exists tr_musteri_cihaz_guncelleme on musteri_cihazlari;
create trigger tr_musteri_cihaz_guncelleme
  before update on musteri_cihazlari
  for each row execute function tg_musteri_cihaz_guncelleme();

-- RLS: yalnız personel (şifre alanı içerir — müşteri portal kullanıcısı GÖREMEZ)
alter table musteri_cihazlari enable row level security;
alter table musteri_cihaz_hareketleri enable row level security;

drop policy if exists musteri_cihaz_staff on musteri_cihazlari;
create policy musteri_cihaz_staff on musteri_cihazlari
  for all using (is_staff()) with check (is_staff());

drop policy if exists mch_staff on musteri_cihaz_hareketleri;
create policy mch_staff on musteri_cihaz_hareketleri
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
