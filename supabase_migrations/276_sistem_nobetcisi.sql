-- 276 — Günlük sistem nöbetçisi (07.08.2026)
--
-- NEDEN: bugün bulunan bozulmaların ortak özelliği SESSİZ olmalarıydı —
-- ekranda hata çıkmıyor, kimse fark etmiyor, veri her gün biraz daha
-- bozuluyordu. 75 servisin tamamlanma tarihi haftalarca boştu; müşteriye
-- giden belgelerde yanlış tarih vardı; bir cihaz 5 kez takılmış görünüyordu.
-- Hepsi de tek bir sayım sorgusuyla ilk günden yakalanabilirdi.
--
-- Bu fonksiyon o sayımları yapar. Her sabah cron çağırır; SORUN VARSA
-- bildirim gider, yoksa SESSİZ kalır (alarm yorgunluğu yaratmamak için).
--
-- Kontroller, kapatılan hataların "nöbetçisi"dir: aynı hata tekrar
-- oluşmaya başlarsa ertesi sabah haber verir.

begin;

create or replace function public.sistem_sagligi_kontrol()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  bulgular jsonb := '[]'::jsonb;
  n bigint;
begin
  -- 1) Kapalı servisin tamamlanma tarihi boş  (mig 274'ün nöbetçisi)
  select count(*) into n from servis_talepleri
   where durum in ('tamamlandi', 'onaylandi') and tamamlanma_tarihi is null;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'servis_tamamlanma_bos', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' kapali servisin tamamlanma tarihi bos — kapanis/SLA raporlari yaniltir');
  end if;

  -- 2) Servis raporundaki gidiş tarihi tamamlanma tarihiyle uyuşmuyor
  --    (müşteriye giden belgede yanlış tarih)  (mig 274'ün nöbetçisi)
  select count(*) into n
    from servis_raporlari sr
    join servis_talepleri st on st.talep_no = sr.fis_no
   where st.tamamlanma_tarihi is not null
     and sr.gid_tarih is distinct from (st.tamamlanma_tarihi at time zone 'Europe/Istanbul')::date;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'rapor_gidis_uyumsuz', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' servis raporunda gidis tarihi yanlis — musteriye giden belge hatali');
  end if;

  -- 3) 0 TL faturalanmış proforma (ciro kaydı sıfır düşer)
  select count(*) into n from fatura_talepleri
   where durum = 'faturalandi' and coalesce(genel_toplam, 0) <= 0;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sifir_tl_fatura', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' fatura 0 TL kaydedilmis — ciro ve kar raporlari eksik');
  end if;

  -- 4) Mükerrer "takıldı" kaydı  (mig 275'in nöbetçisi)
  select count(*) into n from (
    select row_number() over (
             partition by h.kalem_id, coalesce(h.musteri_id, -1) order by h.id) as sira
      from stok_kalemi_hareketleri h
     where h.hareket = 'takildi') x
   where x.sira > 1;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'mukerrer_takildi', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' mukerrer takildi kaydi — cihaz gecmisi sisirilmis gorunur');
  end if;

  -- 5) S/N'li malzeme satırında adet 1 değil (düşümsüz şişme)
  select count(*) into n from servis_malzemeleri
   where seri_no is not null and trim(seri_no) <> '' and coalesce(miktar, 1) <> 1;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sn_satir_adet', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' seri numarali malzeme satirinda adet 1 degil — stoktan dusmeyen miktar olusur');
  end if;

  -- 6) Negatif stok bakiyesi
  select count(*) into n from stok_urunler
   where coalesce(stok_miktari, 0) < 0;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'negatif_stok', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' urunun stok bakiyesi negatif — cikis girisden fazla islenmis');
  end if;

  -- 7) Sahada görünen ama müşterisi belli olmayan S/N'li kalem
  select count(*) into n from stok_kalemleri
   where durum = 'sahada' and musteri_id is null and coalesce(silindi, false) = false;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sahada_musterisiz_kalem', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' cihaz "sahada" ama hangi musteride belli degil — envanter izi kopuk');
  end if;

  -- 8) Mobil uygulamayı kullandığı hâlde bildirim tokeni olmayan personel
  --    (Android'de token kaydi sessizce basarisiz olabiliyor — 07.08 Alp vakasi)
  select count(distinct k.id) into n
    from sozlesme_onaylari o
    join kullanicilar k on k.id = o.kullanici_id
   where (o.cihaz ilike 'android%' or o.cihaz ilike 'ios%')
     and not exists (select 1 from kullanici_push_tokenlari t where t.kullanici_id = k.id);
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'mobil_tokensiz_personel', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' personel mobil kullaniyor ama bildirim tokeni yok — push ulasmiyor');
  end if;

  return jsonb_build_object(
    'tarih', (now() at time zone 'Europe/Istanbul'),
    'bulgular', bulgular,
    'kritik_adet', (select count(*) from jsonb_array_elements(bulgular) b
                     where b->>'agirlik' = 'kritik'),
    'uyari_adet',  (select count(*) from jsonb_array_elements(bulgular) b
                     where b->>'agirlik' = 'uyari'),
    'saglikli', jsonb_array_length(bulgular) = 0
  );
end;
$function$;

comment on function public.sistem_sagligi_kontrol() is
  'Gunluk sistem nobetcisi: kapatilan sessiz bozulmalarin tekrar olusup olusmadigini sayar. sistem-nobetcisi edge fn her sabah cagirir.';

-- anon erişemesin; panel (authenticated) ve cron (service_role) çağırabilsin
revoke all on function public.sistem_sagligi_kontrol() from public, anon;
grant execute on function public.sistem_sagligi_kontrol() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cron — her sabah 08:20 TR (05:20 UTC), hafta içi.
-- Sabah özetinden (08:00) sonra çalışır ki iki bildirim üst üste binmesin.
-- ⚠️ Secret migration dosyasına YAZILMAZ; private.app_settings'ten okunur.
-- ---------------------------------------------------------------------------
select cron.unschedule('sistem-nobetcisi-cron')
 where exists (select 1 from cron.job where jobname = 'sistem-nobetcisi-cron');

select cron.schedule(
  'sistem-nobetcisi-cron',
  '20 5 * * 1-5',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/sistem-nobetcisi',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select deger from private.app_settings where anahtar = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

commit;
