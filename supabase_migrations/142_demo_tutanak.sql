-- 142: Demo modülü v2 — teslim tutanağı + sunucu tarafı uyarılar.
--
-- 1. demo_zimmet_kayitlari: tutanak kolonları + almadı sebebi
-- 2. DMT-YYYY-NNNNNN tutanak no (BEFORE INSERT trigger, 124 gorusme_no kalıbı)
-- 3. demo_cihazlari_durum view'ına tutanak alanları
-- 4. musteri_paylasim_linkleri belge_tipi'ne 'demo_tutanak' + anon okuma RPC'si
-- 5. Storage bucket: demo-tutanak (imzalı taranmış/fotoğraflanmış tutanaklar)
-- 6. pg_cron: demo-uyari-cron — her sabah 06:00 UTC (09:00 TR) demo-uyari-tara
--    edge fn'ini çağırır (iade yaklaşan/geciken + imzasız tutanak bildirimleri).

-- ==================== 1. KOLONLAR ====================
alter table demo_zimmet_kayitlari
  add column if not exists tutanak_no text,
  add column if not exists imzali_tutanak_url text,
  add column if not exists tutanak_gonderildi boolean default false,
  add column if not exists tutanak_hatirlatma_gonderildi boolean default false,
  add column if not exists almadi_sebebi text;

alter table demo_zimmet_kayitlari
  drop constraint if exists demo_zimmet_almadi_sebebi_check;
alter table demo_zimmet_kayitlari
  add constraint demo_zimmet_almadi_sebebi_check
  check (almadi_sebebi is null or almadi_sebebi in
    ('fiyat', 'ihtiyac_yok', 'rakip_secti', 'teknik_yetersiz', 'diger'));

-- ==================== 2. TUTANAK NO ====================
create or replace function demo_tutanak_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil int := extract(year from coalesce(new.veris_tarihi, current_date))::int;
  v_son_no int;
  v_pattern text;
begin
  if new.tutanak_no is not null and new.tutanak_no <> '' then
    return new;
  end if;

  v_pattern := '^DMT-' || v_yil || '-(\d+)$';
  select coalesce(max(substring(tutanak_no from v_pattern)::int), 0)
    into v_son_no
  from demo_zimmet_kayitlari
  where tutanak_no ~ v_pattern;

  new.tutanak_no := 'DMT-' || v_yil || '-' || lpad((v_son_no + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_demo_tutanak_no on demo_zimmet_kayitlari;
create trigger tr_demo_tutanak_no
  before insert on demo_zimmet_kayitlari
  for each row
  execute function demo_tutanak_no_uret();

-- Backfill: mevcut zimmetlere kronolojik sırayla numara ver
do $$
declare
  r record;
  v_yil int;
  v_sayac int;
  v_onceki_yil int := 0;
begin
  for r in
    select id, extract(year from coalesce(veris_tarihi, current_date))::int as yil
    from demo_zimmet_kayitlari
    where tutanak_no is null or tutanak_no = ''
    order by coalesce(veris_tarihi, current_date) asc, id asc
  loop
    if r.yil <> v_onceki_yil then
      v_yil := r.yil;
      v_onceki_yil := r.yil;
      select coalesce(
        max(substring(tutanak_no from ('^DMT-' || v_yil || '-(\d+)$'))::int), 0)
        into v_sayac
      from demo_zimmet_kayitlari
      where tutanak_no ~ ('^DMT-' || v_yil || '-\d+$');
    end if;
    v_sayac := v_sayac + 1;
    update demo_zimmet_kayitlari
       set tutanak_no = 'DMT-' || v_yil || '-' || lpad(v_sayac::text, 6, '0')
     where id = r.id;
  end loop;
end $$;

create unique index if not exists demo_zimmet_tutanak_no_uidx
  on demo_zimmet_kayitlari (tutanak_no) where tutanak_no is not null;

-- ==================== 3. VIEW ====================
-- create or replace sadece sona kolon eklemeye izin verir; kolonlar zaten sonda
-- ama güvenli olsun diye drop + create (view'a bağımlı nesne yok).
drop view if exists demo_cihazlari_durum;
create view demo_cihazlari_durum as
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
  end as gecen_gun,
  z.tutanak_no          as aktif_tutanak_no,
  z.imzali_tutanak_url  as aktif_imzali_tutanak_url,
  z.tutanak_gonderildi  as aktif_tutanak_gonderildi
from demo_cihazlari c
left join demo_zimmet_kayitlari z
  on z.cihaz_id = c.id and z.gercek_iade_tarihi is null;

-- ==================== 4. PAYLAŞIM: demo_tutanak ====================
alter table musteri_paylasim_linkleri
  drop constraint if exists musteri_paylasim_linkleri_belge_tipi_check;
alter table musteri_paylasim_linkleri
  add constraint musteri_paylasim_linkleri_belge_tipi_check
  check (belge_tipi in ('teklif', 'servis_raporu', 'demo_tutanak'));

-- Anon token ile tutanağı okur — cihaz + müşteri bilgisi gömülü tek jsonb.
create or replace function paylasim_demo_tutanak_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id bigint;
  v_belge_tipi text;
  v_result jsonb;
begin
  select belge_id, belge_tipi into v_belge_id, v_belge_tipi
    from musteri_paylasim_linkleri
   where token = in_token
     and not iptal_edildi
     and son_kullanma > now()
   limit 1;

  if v_belge_id is null or v_belge_tipi <> 'demo_tutanak' then
    return null;
  end if;

  select to_jsonb(z.*)
         || jsonb_build_object(
              'cihaz', jsonb_build_object(
                'ad', c.ad, 'marka', c.marka, 'model', c.model,
                'seri_no', c.seri_no, 'kategori', c.kategori, 'notlar', c.notlar),
              'musteri', jsonb_build_object(
                'firma', m.firma, 'ad', m.ad, 'soyad', m.soyad,
                'telefon', m.telefon, 'email', m.email, 'adres', m.adres),
              'lokasyon_ad', l.ad)
    into v_result
    from demo_zimmet_kayitlari z
    join demo_cihazlari c on c.id = z.cihaz_id
    join musteriler m on m.id = z.musteri_id
    left join musteri_lokasyonlari l on l.id = z.lokasyon_id
   where z.id = v_belge_id;

  return v_result;
end;
$$;

grant execute on function paylasim_demo_tutanak_oku(text) to anon, authenticated, service_role;

-- ==================== 5. STORAGE ====================
insert into storage.buckets (id, name, public)
values ('demo-tutanak', 'demo-tutanak', false)
on conflict do nothing;

drop policy if exists demo_tutanak_sel on storage.objects;
create policy demo_tutanak_sel on storage.objects for select
  using (bucket_id = 'demo-tutanak' and is_staff());
drop policy if exists demo_tutanak_ins on storage.objects;
create policy demo_tutanak_ins on storage.objects for insert
  with check (bucket_id = 'demo-tutanak' and is_staff());
drop policy if exists demo_tutanak_del on storage.objects;
create policy demo_tutanak_del on storage.objects for delete
  using (bucket_id = 'demo-tutanak' and is_staff());

-- ==================== 6. PG_CRON ====================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'demo-uyari-cron') then
    perform cron.unschedule('demo-uyari-cron');
  end if;
end $$;

-- 06:00 UTC = 09:00 TR — her sabah bir kez
select cron.schedule(
  'demo-uyari-cron',
  '0 6 * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/demo-uyari-tara',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', current_setting('app.esn_cron_secret', true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

notify pgrst, 'reload schema';
