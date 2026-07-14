-- Görüşme numarası (ACT-NNNN) artık DB trigger ile atanır.
-- Neden: numara istemci tarafında (web Gorusmeler.jsx: liste uzunluğu + 1) üretiliyordu;
-- (1) mobilden açılan görüşmeler akt_no ALMIYORDU → web listesinde "—" görünüyordu,
-- (2) liste-uzunluğu sayacı yarış/duplikasyona açıktı (canlıda ACT-2565 iki kayıtta).
-- Çözüm: BEFORE INSERT trigger, akt_no boşsa global max+1 ile atar (advisory lock ile
-- eşzamanlı insert'lerde çakışmasız). Web + mobil + her giriş noktası otomatik numara alır.

create or replace function gorusme_akt_no_ata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sonraki int;
begin
  -- İstemci/import zaten geçerli bir numara verdiyse dokunma
  if new.akt_no is not null and btrim(new.akt_no) <> '' then
    return new;
  end if;
  -- Eşzamanlı insert'lerde aynı numarayı iki kayda vermeyi engelle
  perform pg_advisory_xact_lock(hashtext('gorusme_akt_no'));
  select coalesce(max((regexp_replace(akt_no, '^ACT-', ''))::int), 0) + 1
    into sonraki
  from gorusmeler
  where akt_no ~ '^ACT-[0-9]+$';
  new.akt_no := 'ACT-' || lpad(sonraki::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_gorusme_akt_no on gorusmeler;
create trigger trg_gorusme_akt_no
  before insert on gorusmeler
  for each row execute function gorusme_akt_no_ata();

-- Geriye dönük: mevcut numarasız (mobilden gelmiş) görüşmeleri sıradan numarala
do $$
declare
  r record;
  sonraki int;
begin
  select coalesce(max((regexp_replace(akt_no, '^ACT-', ''))::int), 0) + 1
    into sonraki
  from gorusmeler
  where akt_no ~ '^ACT-[0-9]+$';
  for r in
    select id from gorusmeler
    where akt_no is null or btrim(akt_no) = ''
    order by olusturma_tarih nulls last, id
  loop
    update gorusmeler set akt_no = 'ACT-' || lpad(sonraki::text, 4, '0') where id = r.id;
    sonraki := sonraki + 1;
  end loop;
end $$;

notify pgrst, 'reload schema';
