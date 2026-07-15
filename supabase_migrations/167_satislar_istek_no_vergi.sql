-- Fatura akışı devamı (madde 12).
--
-- 1) Sahte fatura numarası: /satislar/yeni istemci tarafında FAT-YYYY-NNN üretip
--    "Fatura no" alanına yazıyordu — satışçının uydurduğu bu numara gerçek
--    faturayla ilgisizdi. Artık bizim ürettiğimiz numara FATURA İSTEK NO
--    (FI-YYYY-NNNNNN); fatura_no ise muhasebenin gireceği GERÇEK numara ve o
--    doldurulana kadar boş kalır.
--    Not: fatura_no canlıda zaten nullable (supabase_satis_update.sql bayat).
-- 2) Fatura için vergi no / vergi dairesi şart — kolonlar yoktu, müşteri
--    kartında duruyordu (mig 163 künyesi).

alter table satislar add column if not exists istek_no       text;
alter table satislar add column if not exists vergi_no       text;
alter table satislar add column if not exists vergi_dairesi  text;
-- Abdullah gerçek faturayı bu ekrandan da yükleyebilsin (kuyruktakiyle aynı bucket)
alter table satislar add column if not exists fatura_pdf_yol text;
alter table satislar add column if not exists fatura_pdf_ad  text;

comment on column satislar.istek_no is
  'Fatura İstek No — bizim iç takip numaramız. Kuyruktan geldiyse talebin FTL- numarası, bu ekranda açıldıysa FI- numarası.';
comment on column satislar.fatura_no is
  'GERÇEK fatura numarası — muhasebe (fatura yetkilisi) girer. Kesilene kadar boş.';

create unique index if not exists uq_satislar_istek_no on satislar(istek_no) where istek_no is not null;

-- İstek no: FI-YYYY-NNNNNN. İstemci sayacı YARIŞ üretir — DB'de, advisory lock ile.
-- Kuyruktan gelen satışta istek_no talebin FTL- numarasıyla DOLU gelir; trigger
-- dolu numaraya dokunmaz (farklı önek olduğu için sayaçlar da çakışmaz).
create or replace function satis_istek_no_uret()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_yil text;
  v_son int;
begin
  if new.istek_no is not null and btrim(new.istek_no) <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('satis_istek_no'));
  v_yil := to_char(current_date, 'YYYY');
  select coalesce(max(substring(istek_no from '^FI-\d{4}-(\d+)$')::int), 0)
    into v_son
    from satislar
   where istek_no like 'FI-' || v_yil || '-%';
  new.istek_no := 'FI-' || v_yil || '-' || lpad((v_son + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_satis_istek_no on satislar;
create trigger tr_satis_istek_no
  before insert on satislar
  for each row execute function satis_istek_no_uret();

-- Mevcut kayıtlara istek no ver (2 kayıt) — trigger sadece INSERT'te çalışır
do $$
declare r record; i int := 0; v_yil text := to_char(current_date, 'YYYY');
begin
  for r in select id from satislar where istek_no is null order by created_at loop
    i := i + 1;
    update satislar set istek_no = 'FI-' || v_yil || '-' || lpad(i::text, 6, '0') where id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
