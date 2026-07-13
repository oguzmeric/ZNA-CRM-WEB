-- 146: Hatırlatmalara sahip (kullanici_id) — takip hatırlatması yalnız
-- teklifi/görüşmeyi hazırlayan kişiye görünsün.

alter table hatirlatmalar add column if not exists kullanici_id bigint references kullanicilar(id) on delete set null;

-- Backfill: teklif hatırlatmaları → teklifler.hazirlayan (isim) → kullanicilar.ad eşleşmesi
update hatirlatmalar h
set kullanici_id = k.id
from teklifler t
join kullanicilar k on upper(trim(k.ad)) = upper(trim(t.hazirlayan))
where h.teklif_id = t.id
  and h.kullanici_id is null
  and t.hazirlayan is not null;

-- Backfill: görüşme hatırlatmaları → gorusmeler.olusturan_id (text, sayısal olanlar)
update hatirlatmalar h
set kullanici_id = g.olusturan_id::bigint
from gorusmeler g
where h.gorusme_id = g.id
  and h.kullanici_id is null
  and g.olusturan_id ~ '^[0-9]+$';

notify pgrst, 'reload schema';
