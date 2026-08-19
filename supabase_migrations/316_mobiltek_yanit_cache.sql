-- 316 — Mobiltek yanıt önbelleği + rota sıklığı 3 dk → 5 dk
--
-- AMAÇ: aylık sorgulama kotasını korumak (19.08'de doldu, bkz. mig 315).
-- Aynı /vehicles/ yanıtı kısa aralıkla defalarca isteniyordu:
--   • web Mobiltek sayfası her yenilemede AYNI veriyi İKİ KEZ çekiyor
--     (mobiltek-proxy + arac-yakinlik-tara — alt-ajan denetim bulgusu)
--   • N açık sekme = N ayrı upstream istek
--   • cron'lar (rota + kontak) ayrı ayrı çekiyor
--
-- ÇÖZÜM: edge fonksiyonları arası paylaşılan tek satırlık yanıt önbelleği.
-- İlk isteyen Mobiltek'e gider ve yanıtı buraya yazar; TTL içinde soran
-- herkes buradan okur. In-memory Map OLMAZ: edge instance'ları arasında
-- paylaşılmıyor (mobiltek-proxy'deki rate-limit Map'inin bilinen zaafı).
--
-- Hata yanıtı da önbelleğe alınır (daha uzun TTL): kota doluyken her cron
-- turu boşuna istek atıyordu — o istekler de Mobiltek sayacına yazılıyor
-- olabilir. TTL'ler DB'de değil, okuyan kodda (_shared/mobiltekVehicles.ts).

create table if not exists public.mobiltek_yanit_cache (
  anahtar          text primary key,          -- 'vehicles' (ileride başka uçlar eklenebilir)
  yanit            jsonb not null,
  hata             boolean not null default false,
  olusturma_tarih  timestamptz not null default now()
);

comment on table public.mobiltek_yanit_cache is
  'Mobiltek upstream yanıt önbelleği — edge fonksiyonları service_role ile '
  'okur/yazar. TTL kontrolü kodda (_shared/mobiltekVehicles.ts): başarılı ~55 sn, '
  'hata (kota dolu) ~10 dk. mig 316.';

-- RLS açık + HİÇ policy yok = anon/authenticated erişemez; edge fonksiyonları
-- service_role ile bypass eder. mobiltek_token_cache ile aynı erişim modeli.
alter table public.mobiltek_yanit_cache enable row level security;

-- ── Rota cron 3 dk → 5 dk ────────────────────────────────────────────────
-- Kontak cron'u zaten */5. İkisi AYNI dakikalarda (0,5,10…) tetiklenince
-- ilk çalışan Mobiltek'e gider, ikincisi önbellekten okur — cron başına
-- upstream istek kendiliğinden İKİDEN BİRE iner.
-- ⚠️ mig 315'teki gerekçeyle cron.schedule DEĞİL cron.alter_job: job komutunda
-- düz metin X-Cron-Secret var, yeniden kurmak onu bu dosyaya kopyalamayı
-- gerektirirdi. alter_job komuta dokunmaz.
do $$
declare
  v_jobid bigint;
  v_eski  text;
begin
  select jobid, schedule into v_jobid, v_eski
    from cron.job where jobname = 'mobiltek-rota-cron';

  if v_jobid is null then
    raise notice '316: mobiltek-rota-cron bulunamadi, atlandi';
    return;
  end if;

  if v_eski = '*/5 * * * *' then
    raise notice '316: siklik zaten */5';
    return;
  end if;

  perform cron.alter_job(job_id := v_jobid, schedule := '*/5 * * * *');
  raise notice '316: mobiltek-rota-cron % -> */5 * * * *', v_eski;
end $$;

select jobname, schedule, active from cron.job
 where jobname in ('mobiltek-rota-cron', 'mobiltek-kontak-cron')
 order by jobname;
