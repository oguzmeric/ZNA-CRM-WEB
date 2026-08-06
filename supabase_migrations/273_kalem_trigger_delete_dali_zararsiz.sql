-- 273: trg_kalem_to_stok_hareket DELETE dalı zararsızlaştırıldı (06.08 stok denetimi)
--
-- SORUN: kalem silinince trigger, hareket defterinden
--   aciklama LIKE '%S/N: <seri_no>%'
-- ile kayıt SİLİYORDU. İki ayrı felaket:
--   1) LIKE sona açık — 'JB306240401012' silinirken 'JB3062404010120'..'129'
--      kayıtları da eşleşir (canlıda bu prefix çakışmaları MEVCUT): BAŞKA
--      kalemlerin defter kayıtları yok olur.
--   2) Hareket defteri TARİHÇEDİR — kalem silindi diye geçmiş hareketlerin
--      silinmesi audit kaybı + stok_miktari_senkron DELETE dalıyla etkileşip
--      (ürün SN'siz moda düşmüşse) bakiyeyi kalıcı kaydırır.
-- Ayrıca mobil hard-delete kaldırıldı (soft delete'e geçti) ama trigger yine de
-- her ihtimale karşı defteri korumalı.
--
-- DEĞİŞİKLİK: yalnız DELETE dalı — artık hiçbir hareket silinmez. INSERT/UPDATE
-- davranışı (depoda<->diğer geçişlerinde 1'lik hareket) aynen korunur; mobil
-- kalem işlemlerinin TEK defter kaynağı bu trigger'dır.

create or replace function public.trg_kalem_to_stok_hareket()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_eski_depoda boolean;
  v_yeni_depoda boolean;
  v_hareket_tipi text;
  v_aciklama text;
  v_kullanici text;
  v_stok_adi text;
  v_firma text;
  v_lokasyon text;
  v_teknisyen_ad text;
  v_eski_teknisyen_ad text;
begin
  if (tg_op = 'DELETE') then
    -- Hareket defteri tarihçedir: kalem silinse de defter kayıtları KALIR.
    -- (Eski LIKE'lı silme prefix çakışan S/N'lerin kayıtlarını da yok ediyordu.)
    return old;
  end if;

  v_eski_depoda := (coalesce(old.durum, '') = 'depoda');
  v_yeni_depoda := (new.durum = 'depoda');

  if v_eski_depoda = v_yeni_depoda then
    return new;
  end if;

  v_kullanici := (
    select kullanici_ad from stok_kalemi_hareketleri
    where kalem_id = new.id
    order by tarih desc limit 1
  );

  v_stok_adi := (
    select stok_adi from stok_urunler
    where stok_kodu = new.stok_kodu
    limit 1
  );

  if new.musteri_id is not null then
    v_firma := (select firma from musteriler where id = new.musteri_id limit 1);
  end if;
  if new.musteri_lokasyon_id is not null then
    v_lokasyon := (select ad from musteri_lokasyonlari where id = new.musteri_lokasyon_id limit 1);
  end if;
  if new.teknisyen_id is not null then
    v_teknisyen_ad := (select ad from kullanicilar where id = new.teknisyen_id limit 1);
  end if;
  if old.teknisyen_id is not null then
    v_eski_teknisyen_ad := (select ad from kullanicilar where id = old.teknisyen_id limit 1);
  end if;

  -- HAREKET TİPİ ve AÇIKLAMA (web'in beklediği özel tipler ile)
  if not v_yeni_depoda then
    if new.durum = 'teknisyende' then
      v_hareket_tipi := 'transfer_cikis';
      v_aciklama := format('Personele Transfer · Hedef: %s — S/N: %s',
        coalesce(v_teknisyen_ad, 'Teknisyen'), coalesce(new.seri_no, '—'));
    elsif new.durum = 'sahada' then
      v_hareket_tipi := 'cikis';
      v_aciklama := format('%s%s — S/N: %s',
        coalesce(v_firma, 'Müşteri'),
        case when v_lokasyon is not null then ' / ' || v_lokasyon else '' end,
        coalesce(new.seri_no, '—'));
    elsif new.durum = 'arizada' then
      v_hareket_tipi := 'cikis';
      v_aciklama := format('Arızalı (Teknisyende) — S/N: %s', coalesce(new.seri_no, '—'));
    elsif new.durum = 'arizali_depoda' then
      v_hareket_tipi := 'cikis';
      v_aciklama := format('Arızalı Depoya — S/N: %s', coalesce(new.seri_no, '—'));
    elsif new.durum = 'tamirde' then
      v_hareket_tipi := 'cikis';
      v_aciklama := format('Tamire Gönderildi — S/N: %s', coalesce(new.seri_no, '—'));
    elsif new.durum = 'hurda' then
      v_hareket_tipi := 'cikis';
      v_aciklama := format('Hurdaya Çıktı — S/N: %s', coalesce(new.seri_no, '—'));
    else
      v_hareket_tipi := 'cikis';
      v_aciklama := format('Envanterden çıktı (%s) — S/N: %s', new.durum, coalesce(new.seri_no, '—'));
    end if;
  else
    if old.durum = 'teknisyende' then
      v_hareket_tipi := 'transfer_giris';
      v_aciklama := format('Personelden İade · Kaynak: %s — S/N: %s',
        coalesce(v_eski_teknisyen_ad, 'Teknisyen'), coalesce(new.seri_no, '—'));
    elsif old.durum = 'sahada' then
      v_hareket_tipi := 'giris';
      v_aciklama := format('Müşteriden Söküldü — S/N: %s', coalesce(new.seri_no, '—'));
    elsif old.durum = 'tamirde' then
      v_hareket_tipi := 'giris';
      v_aciklama := format('Tamirden Döndü — S/N: %s', coalesce(new.seri_no, '—'));
    elsif old.durum = 'arizali_depoda' then
      v_hareket_tipi := 'giris';
      v_aciklama := format('Arızalı Depodan Geri — S/N: %s', coalesce(new.seri_no, '—'));
    elsif tg_op = 'INSERT' then
      v_hareket_tipi := 'giris';
      v_aciklama := format('Ana Depo Girişi (yeni kayıt) — S/N: %s', coalesce(new.seri_no, '—'));
    else
      v_hareket_tipi := 'giris';
      v_aciklama := format('Envantere döndü — S/N: %s', coalesce(new.seri_no, '—'));
    end if;
  end if;

  insert into stok_hareketleri (
    stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, kullanici_ad, tarih
  ) values (
    new.stok_kodu,
    coalesce(v_stok_adi, new.stok_kodu),
    v_hareket_tipi,
    1,
    v_aciklama,
    coalesce(v_kullanici, 'Mobil'),
    now()
  );

  return new;
end;
$function$;
