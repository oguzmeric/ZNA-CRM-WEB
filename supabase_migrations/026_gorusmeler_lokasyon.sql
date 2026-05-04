-- =====================================================================
-- Görüşmeler — lokasyon FK kolonu
-- =====================================================================
-- Görüşmenin yapıldığı müşteri lokasyonunu (eğer varsa) işaretlemek için.
-- Nullable: lokasyonu olmayan müşterilerle de görüşme kaydı tutulabilir.
-- =====================================================================

alter table gorusmeler
  add column if not exists lokasyon_id bigint
  references musteri_lokasyonlari(id) on delete set null;

create index if not exists idx_gorusmeler_lokasyon on gorusmeler(lokasyon_id);

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
