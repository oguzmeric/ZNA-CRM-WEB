-- FAZLA MESAİ (01.08.2026) — 19:00'dan sonra başlatılan çalışma ayrı tutulur.
--
-- Mevcut model: normal mesai QR ile başlar, 18:30'da pg_cron kapatır, 18:30-19:00
-- arası "Başla" kilitlidir, 19:00'dan sonra buton tekrar açılır. O pencerede
-- başlatılan kayıt bugüne kadar normal mesaiyle aynı kefeye giriyordu; üstelik
-- 18:30 cron'u ERTESİ GÜN yakaladığı için 20+ saatlik kayıt üretebiliyordu.
--
-- Kullanıcı kararı (Ali Uğur):
--   kapsam  : yalnız 19:00 sonrası başlayanlar fazla mesai sayılır
--   kapanış : personel ELLE bitirir; unutulursa gece 02:00'da otomatik kapanır
--   isim    : rapor sayfası "Çalışma Saatleri" (halk dilinde mesai = fazla çalışma)

alter table public.mesai_kayitlari
  add column if not exists tip text not null default 'normal';

alter table public.mesai_kayitlari
  drop constraint if exists mesai_kayitlari_tip_check;
alter table public.mesai_kayitlari
  add constraint mesai_kayitlari_tip_check check (tip in ('normal', 'fazla'));

create index if not exists idx_mesai_kayitlari_tip
  on public.mesai_kayitlari (tip, giris_zamani desc);

-- Geçmiş veri: 19:00 veya sonrasında başlamış kayıtları fazla mesai işaretle.
-- (Bugün itibarıyla tek kayıt — kural geriye dönük de tutarlı olsun.)
update public.mesai_kayitlari
   set tip = 'fazla'
 where tip = 'normal'
   and extract(hour from giris_zamani at time zone 'Europe/Istanbul') >= 19;

-- ─────────────────────────────────────────────────────────────────────────
-- 18:30 kapanışı ARTIK YALNIZ NORMAL MESAİYİ kapatır.
-- Eskiden `where cikis_zamani is null` idi; 19:00'da başlayan fazla mesai
-- ertesi günün 18:30'una kadar açık kalıp ~23 saat olarak yazılıyordu.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  etkilenen integer;
begin
  update mesai_kayitlari
     set cikis_zamani = now(),
         sure_dakika  = greatest(0, (extract(epoch from (now() - giris_zamani)) / 60)::integer),
         not_ = case
                  when coalesce(not_, '') = '' then 'Otomatik kapatıldı (18:30)'
                  else not_ || ' | Otomatik kapatıldı (18:30)'
                end
   where cikis_zamani is null
     and tip = 'normal';

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$function$;

-- Fazla mesai yedek kapanışı: personel "Bitir" demeyi unutursa gece 02:00.
-- Asıl beklenen elle bitirmedir; bu yalnız açık kayıt bırakmamak içindir.
create or replace function public.fazla_mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  etkilenen integer;
begin
  update mesai_kayitlari
     set cikis_zamani = now(),
         sure_dakika  = greatest(0, (extract(epoch from (now() - giris_zamani)) / 60)::integer),
         not_ = case
                  when coalesce(not_, '') = '' then 'Fazla mesai otomatik kapatıldı (02:00)'
                  else not_ || ' | Fazla mesai otomatik kapatıldı (02:00)'
                end
   where cikis_zamani is null
     and tip = 'fazla';

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$function$;

-- Cron: 02:00 TR = 23:00 UTC (Türkiye kalıcı UTC+3, yaz saati uygulaması yok).
-- Mevcut normal kapanış '30 15 * * *' = 18:30 TR olarak duruyor.
select cron.unschedule('fazla-mesai-otomatik-kapat')
where exists (select 1 from cron.job where jobname = 'fazla-mesai-otomatik-kapat');

select cron.schedule(
  'fazla-mesai-otomatik-kapat',
  '0 23 * * *',
  $$select fazla_mesai_otomatik_kapat();$$
);

notify pgrst, 'reload schema';
