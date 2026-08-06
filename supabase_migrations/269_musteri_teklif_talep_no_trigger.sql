-- 269_musteri_teklif_talep_no_trigger.sql
-- Müşteri portalı "Teklif İste" talepleri bugüne dek localStorage'a yazılıyordu
-- (personel DB'den okuyor — hiçbir talep ulaşmadı). İstemci artık
-- musteri_teklif_talepleri'ne INSERT atacak; talep_no istemcide üretilmez,
-- diğer belge numaraları gibi BEFORE INSERT trigger üretir (mig 046 deseni).
--
-- Format: 'TT-YYYY-NNNN'. SECURITY DEFINER şart (mig 231 dersi): müşteri
-- RLS'i yalnız kendi firmasının satırlarını gördüğünden INVOKER max() eksik
-- sayar ve firmalar arası numara çakışır.

begin;

create or replace function musteri_talep_no_uret()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_yil    int  := extract(year from now());
  v_prefix text := 'TT-' || v_yil::text || '-';
  v_son_no int;
begin
  if new.talep_no is not null and new.talep_no <> '' then
    return new;
  end if;

  -- Eşzamanlı iki talep aynı numarayı üretmesin
  perform pg_advisory_xact_lock(hashtext('musteri_teklif_talep_no'));

  select coalesce(max(substring(talep_no from '\d+$')::int), 0)
  into v_son_no
  from musteri_teklif_talepleri
  where talep_no like v_prefix || '%';

  new.talep_no := v_prefix || lpad((v_son_no + 1)::text, 4, '0');
  return new;
end;
$$;

revoke all on function musteri_talep_no_uret() from public;
revoke all on function musteri_talep_no_uret() from anon;

drop trigger if exists tr_musteri_talep_no_uret on musteri_teklif_talepleri;
create trigger tr_musteri_talep_no_uret
  before insert on musteri_teklif_talepleri
  for each row
  execute function musteri_talep_no_uret();

-- Verilmiş numara benzersiz kalsın (tablo şu an boş — güvenli)
create unique index if not exists ux_musteri_teklif_talep_no
  on musteri_teklif_talepleri (talep_no) where talep_no is not null;

commit;

notify pgrst, 'reload schema';
