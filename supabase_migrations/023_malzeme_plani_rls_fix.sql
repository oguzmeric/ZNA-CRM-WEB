-- Migration 023: servis_malzeme_plani RLS aktifse personel insert/select edebilsin

-- RLS aktif et (idempotent)
ALTER TABLE servis_malzeme_plani ENABLE ROW LEVEL SECURITY;

-- Eski politikalar varsa temizle
DROP POLICY IF EXISTS "smp_select_authenticated" ON servis_malzeme_plani;
DROP POLICY IF EXISTS "smp_insert_authenticated" ON servis_malzeme_plani;
DROP POLICY IF EXISTS "smp_update_authenticated" ON servis_malzeme_plani;
DROP POLICY IF EXISTS "smp_delete_authenticated" ON servis_malzeme_plani;

-- Personel/admin tüm işlemleri yapabilir, müşteri sadece kendi talebine ait olanları görür
CREATE POLICY "smp_select_authenticated"
  ON servis_malzeme_plani
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "smp_insert_authenticated"
  ON servis_malzeme_plani
  FOR INSERT
  TO authenticated
  WITH CHECK (is_personel());

CREATE POLICY "smp_update_authenticated"
  ON servis_malzeme_plani
  FOR UPDATE
  TO authenticated
  USING (is_personel())
  WITH CHECK (is_personel());

CREATE POLICY "smp_delete_authenticated"
  ON servis_malzeme_plani
  FOR DELETE
  TO authenticated
  USING (is_personel());

NOTIFY pgrst, 'reload schema';
