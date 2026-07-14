-- Görüşme takip notu: 'notlar' (web bazı yollar) ile 'takip_notu' (mobil + web liste)
-- iki AYRI kolona yazılıyordu; okuma yolları farklı fallback sırası kullandığından
-- (biri notlar||takip_notu, biri takip_notu||notlar) telefondan girilen not bazı web
-- ekranlarında görünmüyordu. Kalıcı çözüm: iki kolon tek içeriği paylaşsın —
-- BEFORE INSERT/UPDATE trigger senkronlar, mevcut bölünmüş veri backfill edilir.
-- (Canlı kontrol: iki kolonu da dolu 1000+ kayıtta 0 çakışma → backfill güvenli.)

-- 1) Backfill — boş olan tarafı dolu taraftan doldur (dolu-dolu zaten aynı içerik)
update gorusmeler
  set takip_notu = notlar
  where coalesce(btrim(notlar), '') <> '' and coalesce(btrim(takip_notu), '') = '';
update gorusmeler
  set notlar = takip_notu
  where coalesce(btrim(takip_notu), '') <> '' and coalesce(btrim(notlar), '') = '';

-- 2) Trigger — her yazımda iki kolonu eşle
create or replace function gorusme_not_senkron()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- Hangisi doluysa diğerini doldur
    if coalesce(btrim(new.notlar), '') <> '' and coalesce(btrim(new.takip_notu), '') = '' then
      new.takip_notu := new.notlar;
    elsif coalesce(btrim(new.takip_notu), '') <> '' and coalesce(btrim(new.notlar), '') = '' then
      new.notlar := new.takip_notu;
    end if;
  else
    -- UPDATE: değişen kolonu diğerine yansıt (biri değiştiyse tek kaynak o'dur)
    if new.notlar is distinct from old.notlar then
      new.takip_notu := new.notlar;
    elsif new.takip_notu is distinct from old.takip_notu then
      new.notlar := new.takip_notu;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gorusme_not_senkron on gorusmeler;
create trigger trg_gorusme_not_senkron
  before insert or update on gorusmeler
  for each row execute function gorusme_not_senkron();

notify pgrst, 'reload schema';
