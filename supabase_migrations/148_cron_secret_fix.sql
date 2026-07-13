-- 148: Cron secret altyapı onarımı.
-- current_setting('app.esn_cron_secret') DB seviyesinde HİÇ tanımlı değilmiş
-- (mig 120'de alter database satırı yorumda kalmış) → secret kullanan 5 cron
-- işi de edge fonksiyonlardan 401 "yetkisiz" alıyordu (net._http_response'ta
-- kanıtı var; mobiltek-kontak 5dk'da bir sessizce fail).
-- Management API rolü GUC set edemiyor (42501) → çözüm: job komutlarındaki
-- current_setting çağrısını literal değerle değiştir (değer zaten repoda).

do $$
declare
  j record;
begin
  for j in
    select jobid, command from cron.job
    where command like '%current_setting(''app.esn_cron_secret''%'
  loop
    perform cron.alter_job(
      j.jobid,
      command := replace(
        j.command,
        'current_setting(''app.esn_cron_secret'', true)',
        '''c1f94777cbab0a9b529ab94efd60381863366cd36b2d4559'''
      )
    );
  end loop;
end $$;

-- Doğrulama: current_setting kullanan iş kalmamalı
select jobname from cron.job where command like '%current_setting(''app.esn_cron_secret''%';
