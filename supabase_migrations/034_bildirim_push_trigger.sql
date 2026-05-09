-- 034_bildirim_push_trigger.sql
-- bildirimler tablosuna her INSERT sonrası push-gonder edge function'ı çağır.
--
-- ÖNCEDEN ELDEN AYARLANMASI GEREKEN POSTGRES CONFIG:
--   alter database postgres set "app.settings.push_function_url" = 'https://<PROJECT_REF>.supabase.co/functions/v1/push-gonder';
--   alter database postgres set "app.settings.service_role_key" = '<SERVICE_ROLE_KEY>';
-- (Bu komutlar SQL editor'da BİR KEZ çalıştırılır; service_role_key gizlidir,
--  config'te durur, koda hiçbir yerde görünmez.)

create extension if not exists pg_net;

create or replace function public.bildirim_push_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := current_setting('app.settings.push_function_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
begin
  if url is null or service_key is null then
    -- Config yok, sessiz geç (push opsiyonel)
    return new;
  end if;

  perform net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('bildirimId', new.id)
  );
  return new;
exception when others then
  -- Trigger asla bildirim insert'ini bozmasın — push best-effort
  raise warning '[bildirim_push_trigger] hata: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists tr_bildirim_push on public.bildirimler;
create trigger tr_bildirim_push
  after insert on public.bildirimler
  for each row
  execute function public.bildirim_push_trigger();

notify pgrst, 'reload schema';
