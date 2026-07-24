-- 229_gorev_gecikme_sms_cron.sql
-- Ali'nin destek talebi (2026-07-24): "gecikmiş görevlerde SMS gelmesini rica ediyorum".
-- gorev-gecikme-sms edge fonksiyonu TA BAŞTAN yazılmıştı ama hiçbir cron
-- tetiklemiyordu — hiç çalışmamış. Bu migration onu bağlar.
--
-- Zamanlama: hafta içi 06:00 UTC = 09:00 TR (fonksiyonun kendi başlığındaki
-- tasarım saati). Fonksiyon görev başına gecikme_sms_gonderildi bayrağıyla
-- tekilleştirme yapıyor; şu an birikmiş açık gecikme 0 (ölçüldü) — patlama riski yok.
-- Auth: service_role_key private.app_settings'ten (bildirim_push_trigger deseni).

begin;

select cron.unschedule('gorev-gecikme-sms-cron')
 where exists (select 1 from cron.job where jobname = 'gorev-gecikme-sms-cron');

select cron.schedule(
  'gorev-gecikme-sms-cron',
  '0 6 * * 1-5',
  $$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/gorev-gecikme-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select deger from private.app_settings where anahtar = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);

commit;
