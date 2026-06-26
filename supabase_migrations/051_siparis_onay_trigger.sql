-- Teklif 'kabul' durumuna gectiginde siparis_onayi otomatik 'bekliyor' set edilir.
-- Eger siparis_onayi zaten varsa (manuel veya onceki onay) dokunmaz.

create or replace function teklif_kabul_siparis_olustur()
returns trigger
language plpgsql
as $$
begin
  if new.onay_durumu = 'kabul'
     and (old.onay_durumu is distinct from 'kabul')
     and new.siparis_onayi is null then
    new.siparis_onayi = jsonb_build_object('durum', 'bekliyor');
  end if;
  return new;
end;
$$;

drop trigger if exists tr_teklif_kabul_siparis on teklifler;
create trigger tr_teklif_kabul_siparis
  before update on teklifler
  for each row
  execute function teklif_kabul_siparis_olustur();

notify pgrst, 'reload schema';
