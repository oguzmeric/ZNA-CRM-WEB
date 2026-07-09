-- Migration 120: esn-liste-senkron her 10 dakikada bir otomatik çalıştır.
-- Sen manuel "Yeni Kayıtları Çek" yapıyordun; artık cron halleder.
--
-- KURULUM ÖNCESİ (bir kereye mahsus):
-- 1) Supabase Studio → SQL Editor'da bu migration'ı çalıştır
-- 2) supabase secrets set ESN_CRON_SECRET=c1f94777cbab0a9b529ab94efd60381863366cd36b2d4559
--    (kullanıcının kendi CRM klasöründen çalıştırdığı komut, edge fn env'i)
-- 3) SQL Editor'da bir kere aşağıyı çalıştır (DB config'e secret'ı koy):
--    alter database postgres set app.esn_cron_secret = 'c1f94777cbab0a9b529ab94efd60381863366cd36b2d4559';
--    select pg_reload_conf();
--
-- Değişiklik / iptal:
--   select cron.unschedule('esn-liste-cron');
--
-- Log gör:
--   select * from cron.job_run_details where jobname = 'esn-liste-cron' order by start_time desc limit 5;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eski job varsa temizle
do $$ begin
  if exists (select 1 from cron.job where jobname = 'esn-liste-cron') then
    perform cron.unschedule('esn-liste-cron');
  end if;
end $$;

-- Her 10 dk edge fn'i çağır (X-Cron-Secret header ile)
select cron.schedule(
  'esn-liste-cron',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/esn-liste-senkron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', current_setting('app.esn_cron_secret', true)
      ),
      body := '{"limit": 100}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
