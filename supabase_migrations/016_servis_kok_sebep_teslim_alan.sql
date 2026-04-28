-- Migration 016: Servis taleplerine kök sebep, yapılan müdahale ve teslim alan alanları
-- Arıza formu PDF'inde bu alanlar ayrı görünür, müşteri yetkilisi farklı kişi olabilir

ALTER TABLE servis_talepleri
  ADD COLUMN IF NOT EXISTS kok_sebep text,
  ADD COLUMN IF NOT EXISTS yapilan_mudahale text,
  ADD COLUMN IF NOT EXISTS teslim_alan_ad text;

NOTIFY pgrst, 'reload schema';
