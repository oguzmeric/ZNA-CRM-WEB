-- 295 — Müşteri portal hesaplarının rolü 'personel' olarak duruyordu
--
-- BAĞLAM: mig 293 `is_staff()`'a tip kapısı ekleyerek bu hesapların personel
-- verisine erişimini KESTİ. Ama kayıtların kendisi hâlâ `rol='personel'`
-- görünüyordu — kapı doğru, veri yanlış. Bu migration veriyi de düzeltir.
--
-- DOĞRU TANIM SİSTEMDE ZATEN VAR (kullaniciService.js:298):
--     musteri: { tip: 'musteri', rol: 'musteri' }
-- Yani portal hesabı açılırken rol 'musteri' olmalıydı; bu 5 kayıt hatalı
-- girilmiş (elle oluşturma / eski davet akışı).
--
-- ETKİLENEN 5 HESAP (hiçbirinin modülü, mesaisi, görevi, ataması YOK):
--   18 Gökhan Eker        (@zna.local,          firma yok)
--   32 ZNA TEST           (@zna.local,          ZNA TEST)
--   51 ali göktepe        (@gmail.com,          DEMO ŞİRKETİ LTD. ŞTİ (TEST))
--   61 GÖKHAN EKER        (@basakkent.com.tr,   BAŞAKKENT İNŞAAT A.Ş.)
--   64 gurbetciftci3449   (@gmail.com,          firma yok)
-- ⚠️ Gurbet Çiftçi'nin GERÇEK personel hesabı id 63 (@zna.local, tip='zna',
--    modüllü) — ona DOKUNULMUYOR.
--
-- YAN FAYDA: kod her yerde personel listelerini `rol !== 'musteri'` ile
-- süzüyor (AltGorevlerKarti, GorevAkisKarti, GorevOtomasyonModal,
-- KontrolListesiKarti, BridgeTalepler). Rol düzelince bu hesaplar görev atama
-- ve sorumlu seçme listelerinden de düşer — bugüne kadar oralarda görünüyorlardı.
--
-- PORTAL GİRİŞİ ETKİLENMEZ: portal politikaları `current_musteri_id()`
-- üzerinden çalışıyor, o da `tip='musteri'` bakıyor — `rol`'e değil.
--
-- NOT: `kullanicilar.rol` üzerinde CHECK constraint yok; 'musteri' değeri
-- şemaca geçerli ve uygulama tarafında tanınıyor.
-- NOT: `tr_kullanicilar_yetki_koruma` (mig 246) rol değişimini engeller ama
-- `auth.uid() is null` iken geçiş verir — migration/konsol bu yüzden çalışır.

begin;

-- Eski değerler denetim için loglanıyor (geri almak gerekirse buradan okunur)
do $$
declare r record;
begin
  for r in select id, ad, rol, tip from kullanicilar where id in (18,32,51,61,64) loop
    raise notice 'ONCE: id=% ad=% rol=% tip=%', r.id, r.ad, r.rol, r.tip;
  end loop;
end $$;

update kullanicilar
   set rol = 'musteri'
 where id in (18, 32, 51, 61, 64)
   and tip = 'musteri'          -- ⚠️ güvenlik kemeri: tip'i zna olan bir kayda asla dokunma
   and rol = 'personel';        -- ⚠️ zaten düzeltilmişse tekrar yazma (idempotent)

commit;
