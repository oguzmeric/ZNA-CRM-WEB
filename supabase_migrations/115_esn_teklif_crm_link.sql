-- 115: esn_teklifler için CRM link — hangi esnweb teklifi zaten CRM'e aktarıldı?
-- Aynı teklifin 2 kez import edilmesini engellemek + panelde "Zaten aktarıldı" gösterebilmek için.

alter table esn_teklifler
  add column if not exists crm_teklif_id bigint references teklifler(id) on delete set null;

create index if not exists esn_teklifler_crm_link_idx on esn_teklifler (crm_teklif_id) where crm_teklif_id is not null;

notify pgrst, 'reload schema';
