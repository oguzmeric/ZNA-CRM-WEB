-- 315 — Mobiltek sorgu sıklığı düşürüldü (aylık kota koruması)
--
-- SORUN (19.08): Mobiltek `/v1/vehicles/` ucu HTTP 200 ile şunu dönüyor:
--   {"code":40,"description":"Aylık sorgulama limiti doldu.","vehicles":null}
-- Araç konumları 09.08'den, kontak durumları 12.08'den beri güncellenmiyor.
-- Mobiltek'te arıza YOK — aylık sorgulama kotamız ayın ~10'unda tükenmiş.
--
-- Kotayı tüketen bizim çağrı hacmimiz:
--   mobiltek-rota-cron    her dakika       → ayda ~43.200 istek
--   mobiltek-kontak-cron  5 dakikada bir   → ayda  ~8.640 istek
--   web/mobil kullanımı                    → ayda  ~1.000 istek
--                                            ───────────────────
--                                            ayda ~52.000 istek
--
-- Rota cron'u 1 dk → 3 dk: ayda ~43.200 yerine ~14.400 istek (üçte bir).
-- Toplam ~52.000 → ~23.000. Rota çizgisinin çözünürlüğü kabalaşır ama araç
-- takibi için 3 dakika kabul edilebilir; kotanın ay boyunca yetmesi
-- "10 gün yüksek çözünürlük + 20 gün hiç veri"den iyidir.
--
-- ⚠️ cron.schedule ile YENİDEN KURULMUYOR, cron.alter_job ile YALNIZ schedule
-- değiştiriliyor. Sebebi güvenlik: mig 262'de job komutunun içine X-Cron-Secret
-- DÜZ METİN yazılmış. Yeniden schedule etmek o secret'ı bu dosyaya da kopyalamayı
-- gerektirirdi. alter_job komuta hiç dokunmaz — secret nerede duruyorsa orada
-- kalır, yeni bir yere yazılmaz.

do $$
declare
  v_jobid bigint;
  v_eski  text;
begin
  select jobid, schedule into v_jobid, v_eski
    from cron.job where jobname = 'mobiltek-rota-cron';

  if v_jobid is null then
    raise notice '315: mobiltek-rota-cron bulunamadi, atlandi';
    return;
  end if;

  if v_eski = '*/3 * * * *' then
    raise notice '315: sıklık zaten */3, degisiklik yok';
    return;
  end if;

  perform cron.alter_job(job_id := v_jobid, schedule := '*/3 * * * *');
  raise notice '315: mobiltek-rota-cron % -> */3 * * * *', v_eski;
end $$;

-- Doğrulama çıktısı
select jobname, schedule, active
  from cron.job
 where jobname in ('mobiltek-rota-cron', 'mobiltek-kontak-cron')
 order by jobname;
