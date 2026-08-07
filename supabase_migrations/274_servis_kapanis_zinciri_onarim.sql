-- 274 — Servis kapanış zinciri onarımı (07.08.2026)
--
-- SORUN 1: tamamlanma_tarihi ofis onayında SİLİNİYOR
--   Saha akışı iki adımlı: teknisyen kapatır (durum='tamamlandi') → ofis
--   onaylar (durum='onaylandi'). Eski trigger 'tamamlandi' DIŞINDAKİ her
--   duruma geçişte tarihi NULL'lıyordu; ofis onayı da bu dala düşüyordu.
--   Canlıda 75 servisin 75'inde tamamlanma_tarihi boştu — "bugün kaç servis
--   kapandı" sorusu ölçülemiyor, SLA/performans raporları kör.
--
-- SORUN 2: servis raporunda GİDİŞ TARİHİ yanlış (müşteriye giden belge)
--   servis_onay_rapora_yaz, gid_tarih'i coalesce(tamamlanma_tarihi, current_date)
--   ile yazıyor. Sorun 1 yüzünden tamamlanma_tarihi tam o anda NULL oluyor ve
--   belgeye ONAY GÜNÜ yazılıyordu. TLP-2026-0066: servis 05.08'de yapıldı,
--   müşterinin eline giden formda 07.08 yazıyor.
--
-- Kök çözüm: kapanış durumları KÜME olarak ele alınır. Küme içi geçişler
-- (tamamlandi → onaylandi) tarihi KORUR; yalnız kümeden ÇIKIŞ, yani kapatma
-- işleminin geri alınması, tarihi sıfırlar.
--
-- NOT (imza): servis_raporlari.imza_url bir STORAGE YOLU tutar ('esn/13576.png')
-- ve okuyan taraf createSignedUrl ile çözer. servis_talepleri.musteri_imza ise
-- data URI base64'tür. İkisi farklı biçimde olduğu için imza rapora KOPYALANMAZ;
-- form çıktısı imzayı zaten talepten okur (ServisFormu talep.musteriImza).
-- Tek kaynak korunur — kopyalamak hem 100KB'lık ikinci nüsha hem de kırık
-- createSignedUrl demek olurdu.

begin;

-- ---------------------------------------------------------------------------
-- 1) UPDATE trigger'ı: küme içi geçişte tarihi koru
-- ---------------------------------------------------------------------------
create or replace function public.servis_tamamlanma_tarihi_set()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  -- Kapanış kümesi: iş fiilen bitmiştir. 'onaylandi' = ofis onayı (kapalı).
  kapanis constant text[] := array['tamamlandi', 'onaylandi'];
begin
  if new.durum = any(kapanis) and coalesce(old.durum, '') <> all(kapanis) then
    -- Kümeye ilk giriş: damgala. Dışarıdan bilinçli tarih geldiyse ona dokunma.
    new.tamamlanma_tarihi := coalesce(new.tamamlanma_tarihi, now());
  elsif new.durum <> all(kapanis) and coalesce(old.durum, '') = any(kapanis) then
    -- Kümeden çıkış = kapatma geri alındı, damga düşer.
    new.tamamlanma_tarihi := null;
  end if;
  -- Küme içi geçiş (tamamlandi → onaylandi) hiçbir dala girmez: tarih korunur.
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) INSERT trigger'ı: aynı küme
-- ---------------------------------------------------------------------------
create or replace function public.servis_tamamlanma_tarihi_insert()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.durum in ('tamamlandi', 'onaylandi') and new.tamamlanma_tarihi is null then
    new.tamamlanma_tarihi := now();
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Rapor trigger'ı: gid_tarih artık current_date'e düşmüyor
--    Trigger sırası BEFORE (tamamlanma damgası) → AFTER (rapor) olduğu için
--    new.tamamlanma_tarihi bu noktada dolu gelir. Yine de savunma zinciri:
--    tamamlanma → durum geçmişindeki kapanış anı → planlı tarih → açılış günü.
--    current_date fallback KALDIRILDI: "bugün" yazmak sessizce yanlış belge üretir.
-- ---------------------------------------------------------------------------
create or replace function public.servis_onay_rapora_yaz()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_gidis date;
begin
  if new.durum = 'onaylandi' and coalesce(old.durum, '') <> 'onaylandi' then
    -- ⚠️ Tarihler Türkiye saatine göre kesilir. Düz ::date UTC'ye göre keser:
    -- TR saatiyle 21:00'den sonra kapatılan servis belgeye BİR GÜN ÖNCE yazılır.
    v_gidis := coalesce(
      (new.tamamlanma_tarihi at time zone 'Europe/Istanbul')::date,
      (select min((e->>'tarih')::timestamptz) at time zone 'Europe/Istanbul'
         from jsonb_array_elements(
                case when jsonb_typeof(new.durum_gecmisi) = 'array'
                     then new.durum_gecmisi else '[]'::jsonb end) e
        where e->>'durum' = 'tamamlandi')::date,
      new.planli_tarih::date,
      (new.olusturma_tarihi at time zone 'Europe/Istanbul')::date
    );

    insert into servis_raporlari (
      fis_no, firma_adi, cari_kodu, lokasyon, bildiren,
      bildirilen_ariza, sonuc, ariza_kodu, takip_kodu, statu_esn,
      teknisyen, servis_tipi, yukumluluk, servis_yeri,
      bil_tarih, gid_tarih, musteri_id, silindi
    ) values (
      new.talep_no,
      coalesce(new.firma_adi, new.musteri_ad),
      null,
      new.lokasyon,
      nullif(trim(coalesce(new.ilgili_kisi, '')), ''),
      coalesce(nullif(trim(coalesce(new.aciklama, '')), ''), new.konu),
      coalesce(new.cozum_aciklamasi, new.yapilan_mudahale),
      coalesce(new.konu, new.ana_tur),
      'İş tamam',
      'Tamamlandı',
      new.atanan_kullanici_ad,
      coalesce(new.servis_tipi, new.ana_tur),
      new.yukumluluk,
      new.servis_yeri,
      new.olusturma_tarihi::date,
      v_gidis,
      new.musteri_id,
      false
    )
    on conflict (fis_no) do update set
      sonuc = excluded.sonuc,
      bildirilen_ariza = excluded.bildirilen_ariza,
      teknisyen = excluded.teknisyen,
      -- Dolu bir gidiş tarihini NULL ile ezme (yeniden onaylamada veri kaybı)
      gid_tarih = coalesce(excluded.gid_tarih, servis_raporlari.gid_tarih),
      silindi = false;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) GERİ DOLDURMA — tahmin değil, kanıt
--    durum_gecmisi jsonb'si her geçişi tarihiyle tutuyor. Kapanış anı oradan
--    okunur: önce 'tamamlandi' geçişi (teknisyenin kapattığı an), yoksa
--    'onaylandi' geçişi (ofis onayı). Hiçbiri yoksa kayda DOKUNULMAZ —
--    uydurma tarih yazmaktansa boş kalması dürüsttür.
--    Trigger yukarıda düzeltildiği için bu UPDATE (durum değişmiyor) hiçbir
--    dala girmez; yazdığımız değer silinmez.
-- ---------------------------------------------------------------------------
with kapanis as (
  select
    st.id,
    coalesce(
      (select min((e->>'tarih')::timestamptz)
         from jsonb_array_elements(st.durum_gecmisi) e
        where e->>'durum' = 'tamamlandi'),
      (select min((e->>'tarih')::timestamptz)
         from jsonb_array_elements(st.durum_gecmisi) e
        where e->>'durum' = 'onaylandi')
    ) as kapanis_an
  from servis_talepleri st
  where st.durum in ('tamamlandi', 'onaylandi')
    and st.tamamlanma_tarihi is null
    and jsonb_typeof(st.durum_gecmisi) = 'array'
)
update servis_talepleri st
   set tamamlanma_tarihi = k.kapanis_an
  from kapanis k
 where k.id = st.id
   and k.kapanis_an is not null;

-- ---------------------------------------------------------------------------
-- 5) Raporlardaki yanlış gidiş tarihlerini düzelt
--    Yalnızca servis talebine bağlı raporlar (esnweb'den içe aktarılan eski
--    kayıtlar servis_talepleri'nde yok, join eşleşmez, dokunulmaz).
-- ---------------------------------------------------------------------------
update servis_raporlari sr
   set gid_tarih = (st.tamamlanma_tarihi at time zone 'Europe/Istanbul')::date
  from servis_talepleri st
 where sr.fis_no = st.talep_no
   and st.tamamlanma_tarihi is not null
   and sr.gid_tarih is distinct from (st.tamamlanma_tarihi at time zone 'Europe/Istanbul')::date;

commit;
