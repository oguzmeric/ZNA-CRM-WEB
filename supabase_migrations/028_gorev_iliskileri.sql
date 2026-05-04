-- =====================================================================
-- Görev ↔ Görüşme ↔ Servis Talebi ilişkileri
-- =====================================================================
-- Tüm kayıtlar arasında izlenebilir bağlantı kurmak için.
-- FK'ler nullable, "set null" davranışı — silme durumunda referans kaybolur,
-- veriler durur.
-- =====================================================================

-- Görevler tablosuna görüşme + servis talebi referansları
alter table gorevler
  add column if not exists gorusme_id bigint
    references gorusmeler(id) on delete set null,
  add column if not exists servis_talep_id bigint
    references servis_talepleri(id) on delete set null;

-- Servis talepleri tablosuna görev + görüşme referansları
alter table servis_talepleri
  add column if not exists gorev_id bigint
    references gorevler(id) on delete set null,
  add column if not exists gorusme_id bigint
    references gorusmeler(id) on delete set null;

create index if not exists idx_gorevler_gorusme on gorevler(gorusme_id);
create index if not exists idx_gorevler_servis on gorevler(servis_talep_id);
create index if not exists idx_servis_gorev on servis_talepleri(gorev_id);
create index if not exists idx_servis_gorusme on servis_talepleri(gorusme_id);

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
