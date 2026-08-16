-- 294 — İmza bucket'ları PUBLIC'ti: 11.168 imza kimlik doğrulamasız indirilebiliyordu
--
-- BULGU (15.08, canlıda kanıtlandı):
-- `imzalar` (11.168 dosya) ve `siparis-imzalari` (23 dosya) bucket'ları PUBLIC.
-- Önceki değerlendirme "listeleme kapalı, dosya adları zaman damgalı → sadece
-- link bilen erişir" diyordu. ⚠️ BU YANLIŞTI: adlar ARDIŞIK SAYI.
--
--   storage.objects → esn/13576.png, esn/13575.png, esn/13572.png …
--
-- Kimlik doğrulaması OLMADAN yapılan test:
--   GET /storage/v1/object/public/imzalar/esn/13576.png -> HTTP 200 (23.239 bayt)
--   GET /storage/v1/object/public/imzalar/esn/13575.png -> HTTP 200 (31.215 bayt)
--   GET .../esn/1.png (yok)                             -> HTTP 400
--   GET /storage/v1/object/list/imzalar                 -> HTTP 400 (listeleme kapalı)
--
-- Listeleme kapalı olması koruma DEĞİL: ad ardışık olduğu için basit bir
-- sayaç döngüsüyle 11 bin imzanın tamamı toplanabilirdi. İmza kişisel veridir.
--
-- ⚠️ NEDEN GÜVENLE KAPATILIYOR — kırılma riski ölçüldü:
--   • servis_raporlari.imza_url : 11.154 kayıt, HEPSİ YOL (tam URL değil)
--     → kod zaten createSignedUrl ile açıyor (ServisRaporlari.jsx:198, 1047)
--   • kullanicilar.imza         : 13 kayıt, HEPSİ base64 → storage kullanmıyor
--   • Hiçbir tabloda kayıtlı `http…/object/public/imzalar/…` URL'i YOK
--   • storage.objects politikaları ZATEN hazır:
--       imza_authenticated_select        : bucket='imzalar' AND authenticated
--       siparis_imza_authenticated_select: bucket='siparis-imzalari' AND authenticated
--     → giriş yapmış kullanıcı imzalı URL üretmeye devam eder
-- Yani bu değişiklik yalnız ANONİM erişimi keser.
--
-- DOKUNULMAYANLAR (ayrı karar): urun-gorselleri (3.055) ve demirbas-foto (161)
-- hâlâ public. Ürün görseli hassas değil; demirbaş fotoğrafı orta. Bunlarda
-- kayıtlı tam URL olup olmadığı ayrıca ölçülmeli.

begin;

update storage.buckets set public = false where id in ('imzalar', 'siparis-imzalari');

commit;
