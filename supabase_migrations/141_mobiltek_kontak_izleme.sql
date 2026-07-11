-- 141: Mobiltek kontak izleme — mesai dışı kontak açılınca adminlere push.
-- Edge fn: mobiltek-kontak-izle (her 5 dk pg_cron ile çağrılır).
-- Bildirim zinciri: bildirimler INSERT → tr_bildirim_push trigger →
-- push-gonder edge fn → Expo push → admin telefonları.
--
-- Cron secret: mevcut app.esn_cron_secret yeniden kullanılır (mig 120'de
-- DB config'e ve edge env'e ESN_CRON_SECRET olarak zaten kurulmuştu).

-- ── Araç başına kontak durum takibi ─────────────────────────────────
create table if not exists mobiltek_kontak_durumlari (
  arac_id       bigint primary key,
  plaka         text,
  kontak        boolean not null default false,
  son_degisim   timestamptz,          -- kontak durumunun son değiştiği an
  son_gorulme   timestamptz,          -- son tarama zamanı
  son_adres     text,
  son_bildirim  timestamptz           -- spam koruması (30 dk)
);

alter table mobiltek_kontak_durumlari enable row level security;

-- Yazan sadece service_role (edge fn); staff okuyabilir (ileride ekranda göstermek için)
drop policy if exists kontak_durum_read on mobiltek_kontak_durumlari;
create policy kontak_durum_read on mobiltek_kontak_durumlari
  for select using (is_staff());

-- ── pg_cron: her 5 dk tara ──────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'mobiltek-kontak-cron') then
    perform cron.unschedule('mobiltek-kontak-cron');
  end if;
end $$;

select cron.schedule(
  'mobiltek-kontak-cron',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/mobiltek-kontak-izle',
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
