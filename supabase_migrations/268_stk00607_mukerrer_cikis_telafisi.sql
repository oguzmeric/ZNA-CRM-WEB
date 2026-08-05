-- 268 — STK00607 mükerrer çıkış telafisi
-- Uygulandı: 2026-08-05. Bu dosya YAPILAN İŞİN KAYDIDIR; tek sefer çalıştırıldı,
-- yeniden çalıştırılmamalı (içindeki kontrol zaten engeller).
--
-- Sorun: Stok Kartları ekranında "DS-2CD2955FWD-IS" (STK00607) bakiyesi -1
-- görünüyordu. Kök sebep TLP-2026-0031 servis talebinde:
--
--   id 3922  08:55:31  cikis 1   Serviste kullanıldı — TLP-2026-0031
--   id 3923  08:55:31  cikis 1   Serviste kullanıldı — TLP-2026-0031   ← MÜKERRER
--   id 3924  08:57:27  giris 1   Servis kullanımı geri alındı
--
-- "Kullandım" butonunda çift tıklama kilidi yoktu (ne disabled ne setMesgul),
-- aynı saniyede iki çıkış yazıldı; geri alma tek giriş yazdı → net -1.
-- Kod tarafı 62a8db4 ile düzeltildi (mesgul kilidi + stok yetersizlik uyarısı
-- servis malzemesi akışına da bağlandı).
--
-- Yaklaşım: hatalı satır SİLİNMEZ — ters kayıt atılır, iz korunur.
-- Silinmiş olsaydı hatanın kendisi de görünmez olurdu.

begin;

do $$
declare v_bakiye numeric; v_cift int;
begin
  select sum(case when hareket_tipi in ('giris','transfer_giris') then miktar
                  when hareket_tipi in ('cikis','transfer_cikis') then -miktar
                  else 0 end)
    into v_bakiye
  from stok_hareketleri where stok_kodu = 'STK00607';

  select count(*) into v_cift
  from stok_hareketleri
  where id in (3922, 3923) and stok_kodu = 'STK00607' and hareket_tipi = 'cikis';

  if v_bakiye <> -1 then
    raise exception 'İPTAL: STK00607 bakiyesi -1 değil (%). Veri değişmiş, elle bakılmalı.', v_bakiye;
  end if;
  if v_cift <> 2 then
    raise exception 'İPTAL: beklenen mükerrer çift bulunamadı (% satır).', v_cift;
  end if;
end $$;

insert into stok_hareketleri (stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, kullanici_ad, tarih)
select 'STK00607', stok_adi, 'giris', 1,
       'Mükerrer çıkış düzeltmesi — TLP-2026-0031 (hareket #3923 çift yazılmıştı)',
       'Sistem düzeltmesi', now()
from stok_urunler where stok_kodu = 'STK00607';

commit;

-- Doğrulama sonrası: bakiye 0.
--
-- ⚠️ DOKUNULMAYAN 4 ÜRÜN (bilinçli karar):
--   STK00571 (-18), MOB-G0C602 (-1), MOB-G2153C (-1), MOB-G4EA53 (-1)
-- Bunlar S/N takipli; arayüzde bakiye SN sayısından okunuyor (Math.max(0,…))
-- ve 0 görünüyor — yani stok değerini etkilemiyorlar, yalnız hareket geçmişi
-- tutarsız. MOB-G2153C ve MOB-G4EA53'te aynı çift-kayıt deseni var
-- (11.07: 1 giriş / 2 çıkış). Depo ekibi sayımla teyit etmeden dokunulmadı.
