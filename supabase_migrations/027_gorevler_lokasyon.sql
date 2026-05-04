-- =====================================================================
-- Görevler — lokasyon FK kolonu
-- =====================================================================
-- Görevin yapılacağı/ilgili olduğu müşteri lokasyonunu işaretlemek için.
-- Nullable: müşteri ya da lokasyon olmasa da görev oluşturulabilir.
-- =====================================================================

alter table gorevler
  add column if not exists lokasyon_id bigint
  references musteri_lokasyonlari(id) on delete set null;

create index if not exists idx_gorevler_lokasyon on gorevler(lokasyon_id);

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
