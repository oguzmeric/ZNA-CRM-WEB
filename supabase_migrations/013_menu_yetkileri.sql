-- Migration 013: Menü yetkileri
-- Admin, her unvan için hangi menülerin görüneceğini kontrol edebilir.
-- Default: kayıt yoksa menü gözükür.

CREATE TABLE IF NOT EXISTS menu_yetkileri (
  id           bigserial PRIMARY KEY,
  unvan        text NOT NULL,
  menu_anahtari text NOT NULL,
  gorunur      boolean NOT NULL DEFAULT true,
  guncellenme  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unvan, menu_anahtari)
);

CREATE INDEX IF NOT EXISTS idx_menu_yetkileri_unvan ON menu_yetkileri (unvan);

-- RLS
ALTER TABLE menu_yetkileri ENABLE ROW LEVEL SECURITY;

-- Herkes (giriş yapmış) okuyabilir — kullanıcılar kendi yetki listesini çekiyor
DROP POLICY IF EXISTS "menu_yetkileri_select_authenticated" ON menu_yetkileri;
CREATE POLICY "menu_yetkileri_select_authenticated"
  ON menu_yetkileri
  FOR SELECT
  TO authenticated
  USING (true);

-- Sadece yönetim unvanları yazabilir
DROP POLICY IF EXISTS "menu_yetkileri_write_admin" ON menu_yetkileri;
CREATE POLICY "menu_yetkileri_write_admin"
  ON menu_yetkileri
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kullanicilar k
      WHERE k.auth_id = auth.uid()
        AND lower(k.unvan) IN ('teknik müdür', 'genel müdür', 'yazılım geliştirmeci')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM kullanicilar k
      WHERE k.auth_id = auth.uid()
        AND lower(k.unvan) IN ('teknik müdür', 'genel müdür', 'yazılım geliştirmeci')
    )
  );

-- guncellenme otomatik update trigger
CREATE OR REPLACE FUNCTION menu_yetkileri_set_guncellenme() RETURNS trigger AS $$
BEGIN
  NEW.guncellenme = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_yetkileri_guncellenme ON menu_yetkileri;
CREATE TRIGGER trg_menu_yetkileri_guncellenme
  BEFORE UPDATE ON menu_yetkileri
  FOR EACH ROW
  EXECUTE FUNCTION menu_yetkileri_set_guncellenme();

NOTIFY pgrst, 'reload schema';
