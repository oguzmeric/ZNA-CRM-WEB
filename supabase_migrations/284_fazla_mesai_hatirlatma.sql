-- 284 — Fazla mesai hatırlatması + otomatik kapanış bildirimi (13.08.2026)
--
-- SORUN: Fazla mesai QR'sız başlar ve ELLE bitirilir. Kapatmayı unutan kişinin
-- kaydını gece 02:00'da `fazla_mesai_otomatik_kapat()` kapatıyor ve çıkışı
-- `now()` yani 02:00 olarak yazıyor — süre şişiyor. 12.08'de Mehmet Akif ve
-- Ensar'ın kayıtları bu yüzden elle düzeltildi; ikisi de 19:00'da başlayıp
-- 20:30/21:25'te bitirmişlerdi ama 02:00 yazılmıştı.
--
-- ÖLÇÜM (18 fazla mesai kaydı, canlı): gerçek bitişler 19:00–22:49 arasında
-- (19'da 7 kişi, 20'de 4, 21'de 2, 22'de 5). En geç bitiş 22:49.
--   → Hatırlatma 23:00'da gider: o saatte hâlâ açık olan GERÇEKTEN unutulmuştur.
--   → 21:00 seçilseydi 22:00'da biten 5 kişiye boşuna bildirim giderdi.
--
-- İKİ KATMAN:
--   1) 23:00 — kişinin KENDİSİNE hatırlatma. Kendi kapatınca doğru saat yazılır.
--   2) 02:00 — cron yine kapatır AMA artık sessiz değil: yöneticiye haber gider.
--
-- ⚠️ Cron'un yazdığı SÜRE bilerek "düzeltilmiyor". Sistem "muhtemelen 21:00'da
-- bitirmiştir" diye tahmin yazarsa bordroya uydurma veri girer. Kapanış
-- işaretlenir, düzeltmeyi insan yapar — ama artık haberi olur.

-- ---------- 1) Hatırlatma (23:00 TR) ----------

create or replace function public.fazla_mesai_hatirlat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  eklenen integer;
begin
  insert into public.bildirimler (alici_id, baslik, mesaj, tip, link, okundu, meta)
  select
    m.kullanici_id,
    'Fazla mesain hâlâ açık',
    'Mesain ' || to_char(m.giris_zamani at time zone 'Europe/Istanbul', 'HH24:MI')
      || '''ten beri açık ('
      || ((extract(epoch from (now() - m.giris_zamani)) / 3600)::int) || ' sa '
      || (((extract(epoch from (now() - m.giris_zamani)) / 60)::int) % 60) || ' dk). '
      || 'Bitirdiysen uygulamadan kapat — 02:00''da otomatik kapanırsa süren yanlış yazılır.',
    'uyari',
    -- ⚠️ Link ALICININ açabildiği yere gitmeli: teknisyen web'e giremez,
    -- mesai kartı mobil ana ekranda. Bu yüzden link YOK (bildirime dokununca
    -- uygulama zaten ana ekranda açılır).
    null,
    false,
    jsonb_build_object('kaynak', 'mesai', 'olay', 'fazla_mesai_hatirlatma', 'mesai_id', m.id::text)
  from public.mesai_kayitlari m
  where m.cikis_zamani is null
    and m.tip = 'fazla'
    -- Mükerrer koruma: cron elle de çalıştırılabilir, aynı kayıt için ikinci
    -- kez bildirim gitmesin.
    -- ⚠️ `mesai_kayitlari.id` UUID'dir (bigint değil). Karşılaştırma METİN
    -- üzerinden: bozuk/eski bir meta değeri cast hatasıyla cron'u düşürmesin.
    and not exists (
      select 1 from public.bildirimler b
       where b.alici_id = m.kullanici_id
         and b.meta->>'olay' = 'fazla_mesai_hatirlatma'
         and b.meta->>'mesai_id' = m.id::text
    );

  get diagnostics eklenen = row_count;
  return eklenen;
end;
$$;

comment on function public.fazla_mesai_hatirlat() is
  '23:00 TR — açık kalan fazla mesai için kişinin kendisine hatırlatma (mig 284)';

-- ---------- 2) Otomatik kapanış artık sessiz değil ----------

create or replace function public.fazla_mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  etkilenen integer;
  ozet text;
begin
  -- Kapatılanları TOPLA: yöneticiye kayıt başına ayrı bildirim yerine tek özet
  -- gider (üç kişi unutmuşsa üç ayrı push gürültü olurdu).
  with kapanan as (
    update public.mesai_kayitlari m
       set cikis_zamani = now(),
           sure_dakika  = greatest(0, (extract(epoch from (now() - m.giris_zamani)) / 60)::integer),
           not_ = case
                    when coalesce(m.not_, '') = '' then 'Fazla mesai otomatik kapatıldı (02:00)'
                    else m.not_ || ' | Fazla mesai otomatik kapatıldı (02:00)'
                  end
     where m.cikis_zamani is null
       and m.tip = 'fazla'
    returning m.kullanici_id, m.giris_zamani, m.sure_dakika
  )
  select count(*),
         string_agg(
           k.ad || ' (' || to_char(kp.giris_zamani at time zone 'Europe/Istanbul', 'HH24:MI')
             || '''den beri, ' || (kp.sure_dakika / 60) || ' sa yazıldı)',
           ' · ' order by k.ad)
    into etkilenen, ozet
    from kapanan kp
    left join public.kullanicilar k on k.id = kp.kullanici_id;

  if coalesce(etkilenen, 0) > 0 then
    -- Ali (1) + Oğuz (2). Sabah özeti de aynı ikiliye gidiyor; kullanıcı
    -- kararı 13.08.2026. Diğer adminler (Ahmet 29, Ferdi 33) kapsam dışı.
    insert into public.bildirimler (alici_id, baslik, mesaj, tip, link, okundu, meta)
    select
      a.id,
      etkilenen || ' fazla mesai 02:00''da otomatik kapatıldı',
      ozet || ' — süreler gerçek bitişe göre düzeltilmeli.',
      'uyari',
      '/mesai-raporu',
      false,
      jsonb_build_object('kaynak', 'mesai', 'olay', 'fazla_mesai_otomatik_kapandi', 'adet', etkilenen)
    from (values (1::bigint), (2::bigint)) as a(id)
    where exists (select 1 from public.kullanicilar k where k.id = a.id);
  end if;

  return coalesce(etkilenen, 0);
end;
$$;

comment on function public.fazla_mesai_otomatik_kapat() is
  '02:00 TR — açık kalan fazla mesaileri kapatır; kapatma olursa Ali+Oğuz''a özet bildirim (mig 284)';

-- ---------- 3) Cron ----------

-- 23:00 TR = 20:00 UTC. Türkiye kalıcı UTC+3 (yaz saati yok).
select cron.unschedule('fazla-mesai-hatirlat')
 where exists (select 1 from cron.job where jobname = 'fazla-mesai-hatirlat');

select cron.schedule('fazla-mesai-hatirlat', '0 20 * * *', $$select public.fazla_mesai_hatirlat();$$);
