-- Görev atanan kişi: web 'atanan' (text id) kolonuna, mobil 'atanan_id'(int)+'atanan_ad'
-- kolonlarına yazıyordu. Web listesi atanan'a, mobil listesi atanan_ad'e baktığından
-- telefondan açılan görevin atananı webte, webden açılanın atananı mobilde görünmüyordu.
-- Çözüm (mig 160 takip notu senkronu ile aynı desen): üç kolon tek kişiyi paylaşsın —
-- BEFORE INSERT/UPDATE trigger senkronlar + mevcut veri backfill.

create or replace function gorev_atanan_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text;
begin
  if TG_OP = 'UPDATE' then
    -- Değişen kaynağı otorite al (web atanan'ı, mobil atanan_id'yi değiştirir)
    if new.atanan is distinct from old.atanan and new.atanan ~ '^[0-9]+$' then
      new.atanan_id := new.atanan::bigint;
      new.atanan_ad := (select ad from kullanicilar where id = new.atanan::bigint);
      return new;
    elsif new.atanan_id is distinct from old.atanan_id and new.atanan_id is not null then
      new.atanan := new.atanan_id::text;
      if coalesce(btrim(new.atanan_ad), '') = '' then
        new.atanan_ad := (select ad from kullanicilar where id = new.atanan_id);
      end if;
      return new;
    end if;
  end if;

  -- INSERT ya da değişiklik saptanmayan UPDATE: eksik kolonları birbirinden türet
  if new.atanan_id is null and new.atanan ~ '^[0-9]+$' then
    new.atanan_id := new.atanan::bigint;
  elsif (new.atanan is null or btrim(new.atanan) = '') and new.atanan_id is not null then
    new.atanan := new.atanan_id::text;
  end if;
  if coalesce(btrim(new.atanan_ad), '') = '' and new.atanan_id is not null then
    new.atanan_ad := (select ad from kullanicilar where id = new.atanan_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gorev_atanan_senkron on gorevler;
create trigger trg_gorev_atanan_senkron
  before insert or update on gorevler
  for each row execute function gorev_atanan_senkron();

-- Backfill: mevcut görevlerde eksik atama kolonlarını doldur
update gorevler set atanan_id = atanan::bigint
  where atanan ~ '^[0-9]+$' and atanan_id is null;
update gorevler set atanan = atanan_id::text
  where atanan_id is not null and (atanan is null or btrim(atanan) = '');
update gorevler g set atanan_ad = k.ad
  from kullanicilar k
  where g.atanan_id = k.id and coalesce(btrim(g.atanan_ad), '') = '';

notify pgrst, 'reload schema';
