-- 112: Mesai otomatik kapama — her gün 18:30 TR (15:30 UTC)
-- Teknisyen "Mesai Bitir" butonuna basmayı unutursa sistem otomatik kapatır.
-- Erken çıkacaklar hala butonu kullanabilir.

-- pg_cron extension (Supabase'de mevcut, sadece enable)
create extension if not exists pg_cron;

-- Aktif mesaileri kapatan fonksiyon
create or replace function mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  etkilenen integer;
begin
  update mesai_kayitlari
  set
    cikis_zamani = now(),
    not_ = 'Otomatik kapatıldı (18:30)'
  where cikis_zamani is null
    and (giris_zamani at time zone 'Europe/Istanbul')::date
        = (now() at time zone 'Europe/Istanbul')::date;

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$$;

-- Var olan schedule varsa temizle (idempotent)
do $$
begin
  perform cron.unschedule('mesai-otomatik-kapat');
exception when others then null;
end $$;

-- Her gün 15:30 UTC = 18:30 TR (Türkiye UTC+3 sabit, DST yok 2016'dan beri)
select cron.schedule(
  'mesai-otomatik-kapat',
  '30 15 * * *',
  'select mesai_otomatik_kapat();'
);

notify pgrst, 'reload schema';
