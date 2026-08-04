-- 262 — Rota çözünürlüğü + gerçek km/hız kaynağı (04.08)
--
-- SORUN (kullanıcı): "Rota kuş bakışı geliyor, hangi yollardan gittiğini
-- göremiyoruz" + "en yüksek hız —  görünüyor, gerçek hızı almamız gerekli".
--
-- ⭐ TEŞHİS — ilk günün verisi: ardışık GPS noktaları arasındaki fark
--     KM2            : en kısa 10 sn, ortalama 11 dk
--     34 MDY 127     : en kısa 79 sn, ortalama 17 dk
--     34 FOD 17      : tek aralık, 6 dk
-- Yani CİHAZ sık rapor veriyor (10 saniyeye kadar), ama biz 2 dakikada bir
-- yalnız "son konumu" soruyoruz. Aradaki noktalar Mobiltek'te kalıyor.
-- 3,3 km'lik yol 2 noktayla çizilince düz çizgi oluyor; aracın hızlandığı
-- anlar da örneklemeye denk gelmediği için max hız 0 kalıyor.
--
-- BU MİGRATION İKİ ŞEY YAPAR:
--   1) Örnekleme sıklığını 2 dk → 1 dk (pg_cron'un alt sınırı). Çözünürlük
--      iki katına çıkar. Tam çözüm DEĞİLDİR — asıl çözüm Mobiltek'in
--      location-logs ucunun yetkisidir (mig 261 notuna bakınız: uç var,
--      hesabımız yetkisiz, 401).
--   2) ODOMETRE kaydı. v1/vehicles/ cevabında `odometer` alanı var ve bu
--      aracın GERÇEK kilometre sayacıdır. Günün ilk/son odometre farkı,
--      seyrek GPS noktalarından hesaplanan kuş uçuşu mesafeden çok daha
--      doğru "bugün kaç km yaptı" verir. GPS mesafesi tahmin, odometre ölçüm.

begin;

-- ── 1) Odometre: hem ham izde hem araç durumunda ────────────────────────
alter table public.arac_konum_izleri
  add column if not exists odometre integer;   -- km (Mobiltek 'odometer')

comment on column public.arac_konum_izleri.odometre is
  'Aracın km sayacı. Günlük gerçek mesafe = son - ilk (GPS mesafesinden doğru).';

alter table public.arac_iz_durumu
  add column if not exists son_odometre integer;

-- ── 2) Örnekleme sıklığı: 2 dk → 1 dk ──────────────────────────────────
do $$ begin
  if exists (select 1 from cron.job where jobname = 'mobiltek-rota-cron') then
    perform cron.unschedule('mobiltek-rota-cron');
  end if;
end $$;

select cron.schedule(
  'mobiltek-rota-cron',
  '* * * * *',              -- her dakika (pg_cron alt sınırı)
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/mobiltek-rota-kaydet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', 'c1f94777cbab0a9b529ab94efd60381863366cd36b2d4559'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

-- ── 3) Günlük araç özeti — odometre tabanlı gerçek mesafe ──────────────
-- Arayüz bunu tek çağrıda alsın diye RPC. GPS mesafesi istemcide hesaplanır
-- (çizgi zaten orada), buradaki odometre farkı ise ölçülmüş gerçektir.
create or replace function public.arac_gun_ozeti(
  p_arac_id bigint,
  p_baslangic timestamptz,
  p_bitis timestamptz
)
returns table (
  ilk_odometre  integer,
  son_odometre  integer,
  odometre_km   integer,
  max_hiz       numeric,
  nokta_sayisi  integer
)
language sql
stable
security invoker          -- RLS aynen uygulanır: yetkisiz kullanıcı boş alır
set search_path to 'public'
as $$
  with veri as (
    select odometre, hiz, olcum_zamani
    from public.arac_konum_izleri
    where arac_id = p_arac_id
      and olcum_zamani between p_baslangic and p_bitis
  )
  select
    (select odometre from veri where odometre is not null order by olcum_zamani limit 1),
    (select odometre from veri where odometre is not null order by olcum_zamani desc limit 1),
    greatest(0, coalesce(
      (select odometre from veri where odometre is not null order by olcum_zamani desc limit 1) -
      (select odometre from veri where odometre is not null order by olcum_zamani limit 1), 0))::int,
    coalesce((select max(hiz) from veri), 0),
    (select count(*) from veri)::int;
$$;

grant execute on function public.arac_gun_ozeti(bigint, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;

select 'cron: ' || schedule as bilgi from cron.job where jobname = 'mobiltek-rota-cron'
union all
select 'odometre kolonu: ' || count(*)::text
from information_schema.columns
where table_schema='public' and table_name='arac_konum_izleri' and column_name='odometre';
