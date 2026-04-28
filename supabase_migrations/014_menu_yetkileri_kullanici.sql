-- Migration 014: menu_yetkileri'ni unvan-bazlıdan kullanıcı-bazlıya çevir
-- Her kullanıcı için ayrı menü yetkisi tanımlanabilir.

-- Eski tabloyu temizle (013'te oluşturulmuştu, henüz veri yok)
DROP TABLE IF EXISTS menu_yetkileri CASCADE;

CREATE TABLE menu_yetkileri (
  id            bigserial PRIMARY KEY,
  kullanici_id  bigint NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  menu_anahtari text NOT NULL,
  gorunur       boolean NOT NULL DEFAULT true,
  guncellenme   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kullanici_id, menu_anahtari)
);

CREATE INDEX idx_menu_yetkileri_kullanici ON menu_yetkileri (kullanici_id);

ALTER TABLE menu_yetkileri ENABLE ROW LEVEL SECURITY;

-- Authenticated kullanıcı kendi yetki listesini okuyabilir, admin hepsini okur
CREATE POLICY "menu_yetkileri_select_authenticated"
  ON menu_yetkileri
  FOR SELECT
  TO authenticated
  USING (true);

-- Sadece yönetim unvanları yazabilir
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
