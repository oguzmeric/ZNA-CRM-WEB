-- 194: Kullanılan Malzemeler günlük gecikme uyarısı cron'u (madde 23.11, F4)
-- Hafta içi 09:15 TR (06:15 UTC) — malzeme-uyari-tara edge fn'i tetikler;
-- fn bekleyen kalem yoksa bildirim atmaz (sessiz geçer).
select cron.unschedule('malzeme-uyari-cron')
where exists (select 1 from cron.job where jobname = 'malzeme-uyari-cron');

select cron.schedule(
  'malzeme-uyari-cron',
  '15 6 * * 1-5',
  $$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/malzeme-uyari-tara',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select deger from private.app_settings where anahtar = 'service_role_key')
      ),
      body := '{}'::jsonb
    )
  $$
);

select jobname, schedule from cron.job where jobname = 'malzeme-uyari-cron';
