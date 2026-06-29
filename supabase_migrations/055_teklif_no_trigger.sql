-- teklif_no client-side uretildigi icin race + stale state sorunlari yasiyoruz.
-- talep_no_trigger ile ayni patern: BEFORE INSERT trigger, teklif_no NULL/bos ise
-- DB max+1 ile uretir.
--
-- Format: 'TEK-NNNN' (4 haneli, padding'li). Eski farkli formatlar (ZNA-, vs.)
-- yok sayilir — sadece TEK-NNNN regex'i ile match olan kayitlar baz alinir.
--
-- Client yine de teklif_no gonderebilir; gondermisse trigger dokunmaz.

create or replace function teklif_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_son_no int;
begin
  -- Client zaten verdiyse dokunma
  if new.teklif_no is not null and new.teklif_no <> '' then
    return new;
  end if;

  -- TEK-NNNN formatindaki en buyuk numarayi bul, +1
  select coalesce(
    max(substring(teklif_no from '^TEK-(\d+)$')::int),
    0
  ) into v_son_no
  from teklifler
  where teklif_no ~ '^TEK-\d+$';

  new.teklif_no := 'TEK-' || lpad((v_son_no + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists tr_teklif_no_uret on teklifler;
create trigger tr_teklif_no_uret
  before insert on teklifler
  for each row
  execute function teklif_no_uret();

notify pgrst, 'reload schema';
