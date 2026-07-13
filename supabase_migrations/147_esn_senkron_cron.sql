-- 147: esnweb servis raporu senkronu — 10 dakikada bir otomatik.
-- "Yeni Kayıtları Çek" butonuna manuel basma ihtiyacını kaldırır.
-- esn-liste-senkron X-Cron-Secret kabul eder; detayCek:true ile yeni/değişen
-- fişlerin detayları da sunucu tarafında zincirlenir (30 fiş/koşu cap).

select cron.unschedule('esn-senkron-cron')
where exists (select 1 from cron.job where jobname = 'esn-senkron-cron');

select cron.schedule(
  'esn-senkron-cron',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/esn-liste-senkron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', current_setting('app.esn_cron_secret', true)
      ),
      body := '{"limit":100,"detayCek":true}'::jsonb,
      timeout_milliseconds := 90000
    );
  $cron$
);
