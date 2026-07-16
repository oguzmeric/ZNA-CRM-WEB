-- 180 — Görüşen normalize: kullanıcı adı ("hasan") → görünen ad ("Hasan Yılmaz")
--
-- Eski mobil kod görüşen alanına kullanici_adi yazmış (mig 129 notu). Liste
-- görünen adı gösterdiğinden "hasan" gibi kayıtlar tutarsız görünüyordu.
-- gorusen değeri bir kullanici_adi ile TAM eşleşen (ve ad'dan farklı olan)
-- satırları ilgili görünen ada çevir. Çoklu (virgüllü) değerler tek kullanici_adi
-- ile eşleşmeyeceğinden dokunulmaz.

update gorusmeler g
set gorusen = k.ad
from kullanicilar k
where lower(btrim(g.gorusen)) = lower(k.kullanici_adi)
  and coalesce(btrim(g.gorusen), '') <> ''
  and coalesce(k.ad, '') <> ''
  and lower(btrim(g.gorusen)) <> lower(k.ad);
