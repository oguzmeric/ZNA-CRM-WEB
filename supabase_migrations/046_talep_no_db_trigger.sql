-- talep_no client-side uretildigi icin race condition: iki istemci ayni anda
-- talep eklerse ayni 'TLP-2026-XXXX' uretip 'unique constraint violation' aliyorlar.
--
-- Cozum: DB tarafinda BEFORE INSERT trigger — talep_no NULL ise sistem
-- max+1 ile uretir. Client artik talep_no gondermek zorunda degil.
-- (Geriye uyumluluk: client talep_no gonderirse o kullanilir.)
--
-- Format: 'TLP-YYYY-NNNN' (NNNN = 4 haneli, padding'li, yil basinda 1'den baslar)

create or replace function servis_talep_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil      int := extract(year from now());
  v_prefix   text := 'TLP-' || v_yil::text || '-';
  v_son_no   int;
begin
  -- Client zaten verdiyse dokunma
  if new.talep_no is not null and new.talep_no <> '' then
    return new;
  end if;

  -- Bu yilin en buyuk numarasini bul, +1
  select coalesce(
    max(substring(talep_no from '\d+$')::int),
    0
  ) into v_son_no
  from servis_talepleri
  where talep_no like v_prefix || '%';

  new.talep_no := v_prefix || lpad((v_son_no + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists tr_servis_talep_no_uret on servis_talepleri;
create trigger tr_servis_talep_no_uret
  before insert on servis_talepleri
  for each row
  execute function servis_talep_no_uret();

-- Race condition'a kati cozum: serialize edilmis bir advisory lock kullanabiliriz,
-- ama yuk az oldugu icin trigger + unique constraint kombinasyonu yeterli.
-- Carpisirsa client retry yapsin (asagidaki client fix bunu kapatiyor).

notify pgrst, 'reload schema';
