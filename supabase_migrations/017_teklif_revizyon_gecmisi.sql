-- Migration 017: Teklif revizyon geçmişi
-- Her revize öncesinde mevcut hali snapshot olarak saklanır

ALTER TABLE teklifler
  ADD COLUMN IF NOT EXISTS revizyon_gecmisi jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN teklifler.revizyon_gecmisi IS
  'Her eleman: {revizyon, tarih, genelToplam, paraBirimi, satirlar, snapshotTarihi}';

NOTIFY pgrst, 'reload schema';
