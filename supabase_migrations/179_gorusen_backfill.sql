-- 179 — Görüşen backfill: mobilden oluşturulan görüşmelerde "görüşen" boştu
--
-- Web formu gorusen = kullanıcı adı yazar; mobil YeniGörüşme yalnız hazirlayan
-- yazıp gorusen'i boş bırakıyordu → web listesindeki GÖRÜŞEN kolonu boş görünüyordu.
-- Mobil düzeltmesi artık gorusen yazıyor; bu backfill eskiden kalan boşları doldurur.
-- Yalnız gorusen boş VE hazirlayan dolu olan satırlara dokunur (mevcut veriyi ezmez).

update gorusmeler
set gorusen = hazirlayan
where coalesce(btrim(gorusen), '') = ''
  and coalesce(btrim(hazirlayan), '') <> '';
