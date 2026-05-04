-- =====================================================================
-- Teklifler — şablon tipi kolonu
-- =====================================================================
-- Trassir / Karel / Standart şablon ayrımı için.
-- Mevcut tüm satırlar 'standart' default'u alır.
-- =====================================================================

alter table teklifler
  add column if not exists teklif_tipi text not null default 'standart';

-- Geçerli değerleri kısıtla
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teklifler_teklif_tipi_check'
  ) then
    alter table teklifler
      add constraint teklifler_teklif_tipi_check
      check (teklif_tipi in ('standart','trassir','karel'));
  end if;
end$$;

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
