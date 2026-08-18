-- 306 — nöbetçi "0 TL fatura" kontrolü bedelsiz faturaları saymasın
--
-- VAKA (18.08): sabah nöbet mesajı "🔴 12 fatura 0 TL kaydedilmis — ciro ve
-- kar raporlari eksik" dedi. Ölçüm: 12'sinin TAMAMI `bedelsiz=true` işaretli
-- (numune/garanti değişimi — bilinçli 0 TL, `bedelsiz_sebep` alanı dolu).
-- Kontrol mig 276'da yazıldığında bedelsiz kavramı hesaba katılmamıştı;
-- her bedelsiz fatura kesildikçe YANLIŞ ALARM üretiyordu.
--
-- DÜZELTME: yalnız 3. kontrole `bedelsiz=false` şartı + mesaja "(bedelsiz
-- haric)" netliği. Gerçek hata (yanlışlıkla 0 TL girilen fatura) yakalanmaya
-- DEVAM EDER. Diğer 9 kontrol AYNEN korunur (tanım pg_get_functiondef'ten).

CREATE OR REPLACE FUNCTION public.sistem_sagligi_kontrol()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 3) 0 TL faturalanmış proforma — BİLİNÇLİ bedelsiz fatura (numune/garanti,
  --    bedelsiz=true) MEŞRUDUR, sayılmaz (mig 306; 12 bedelsiz kayıt her
  --    sabah yanlış alarm üretiyordu). Gerçek 0 TL hatası yakalanmaya devam eder.
  select count(*) into n from fatura_talepleri
   where durum = 'faturalandi' and coalesce(genel_toplam, 0) <= 0
     and coalesce(bedelsiz, false) = false;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sifir_tl_fatura', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' fatura 0 TL kaydedilmis (bedelsiz haric) — ciro ve kar raporlari eksik');
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

  -- 5) S/N'li malzeme satırında adet 1 değil
  select count(*) into n from servis_malzemeleri
   where seri_no is not null and trim(seri_no) <> '' and coalesce(miktar, 1) <> 1;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sn_satir_adet', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' seri numarali malzeme satirinda adet 1 degil — stoktan dusmeyen miktar olusur');
  end if;

  -- 6) Negatif stok bakiyesi
  select count(*) into n from stok_urunler where coalesce(stok_miktari, 0) < 0;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'negatif_stok', 'agirlik', 'kritik', 'adet', n,
      'mesaj', n || ' urunun stok bakiyesi negatif — cikis girisden fazla islenmis');
  end if;

  -- 7) Sahada görünen ama müşterisi belli olmayan kalem  (mig 277'nin nöbetçisi)
  select count(*) into n from stok_kalemleri
   where durum = 'sahada' and musteri_id is null and coalesce(silindi, false) = false;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'sahada_musterisiz_kalem', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' cihaz "sahada" ama hangi musteride belli degil — envanter izi kopuk');
  end if;

  -- 8) Mobil kullanıp bildirim tokeni olmayan personel
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

  -- 9) Depoda olup arşiv kaydı olmayan servis formu (yetim PDF)
  select yetim_servis_formu_sayisi() into n;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'yetim_servis_formu', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' servis formu PDF''i depoda ama arsiv kaydi yok — servis silinince dosya kaliyor');
  end if;

  -- 10) Arşiv kaydı var ama oluşturanı boş (RLS reddi/gecmis veri izi)
  select count(*) into n from servis_formu_arsivi where olusturan_id is null;
  if n > 0 then
    bulgular := bulgular || jsonb_build_object(
      'kod', 'arsiv_olusturansiz', 'agirlik', 'uyari', 'adet', n,
      'mesaj', n || ' arsiv kaydinda olusturan bos — kim yukledi izlenemiyor');
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
