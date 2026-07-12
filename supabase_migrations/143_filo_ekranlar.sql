-- 143: Filo ekranları destek paketi.
-- 1. filo-belge storage bucket (poliçe/fatura/fiş dosyaları — private)
-- 2. kullanicilar: ehliyet_sinifi + ehliyet_bitis (Sürücüler sayfası)
-- 3. pg_cron: arac-km-sync günlük 05:30 UTC (08:30 TR) — belge/bakım uyarıları
--    (KM artık yakıt/bakım girişlerinden güncellenir; Mobiltek odometer=0 dönüyor)

-- ==================== 1. STORAGE ====================
insert into storage.buckets (id, name, public)
values ('filo-belge', 'filo-belge', false)
on conflict do nothing;

drop policy if exists filo_belge_sel on storage.objects;
create policy filo_belge_sel on storage.objects for select
  using (bucket_id = 'filo-belge' and is_staff());
drop policy if exists filo_belge_ins on storage.objects;
create policy filo_belge_ins on storage.objects for insert
  with check (bucket_id = 'filo-belge' and is_staff());
drop policy if exists filo_belge_del on storage.objects;
create policy filo_belge_del on storage.objects for delete
  using (bucket_id = 'filo-belge' and is_staff());

-- ==================== 2. EHLİYET ====================
alter table kullanicilar
  add column if not exists ehliyet_sinifi text,
  add column if not exists ehliyet_bitis date;

-- ==================== 3. PG_CRON ====================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'arac-km-sync-cron') then
    perform cron.unschedule('arac-km-sync-cron');
  end if;
end $$;

-- 05:30 UTC = 08:30 TR — her sabah bir kez (belge/bakım bitiş uyarıları)
select cron.schedule(
  'arac-km-sync-cron',
  '30 5 * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/arac-km-sync',
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
