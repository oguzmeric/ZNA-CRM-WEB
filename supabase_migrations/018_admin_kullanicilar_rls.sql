-- Migration 018: Admin (yönetim unvanları) kullanicilar tablosundaki tüm
-- personel kayıtlarını okuyabilsin. Müşteri portal kullanıcıları yine
-- kendi kayıtları dışında bir şey göremez.

-- Önce kullanicilar RLS aktif mi?
ALTER TABLE kullanicilar ENABLE ROW LEVEL SECURITY;

-- Admin OKUMA politikası: yönetim unvanları tüm kullanicilar'ı görür
DROP POLICY IF EXISTS "kullanicilar_select_admin" ON kullanicilar;
CREATE POLICY "kullanicilar_select_admin"
  ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kullanicilar k2
      WHERE k2.auth_id = auth.uid()
        AND lower(k2.unvan) IN ('teknik müdür', 'genel müdür', 'yazılım geliştirmeci')
    )
  );

-- Personel OKUMA politikası: kendi kaydını + diğer personeli (müşteri olmayan) görür
DROP POLICY IF EXISTS "kullanicilar_select_personel" ON kullanicilar;
CREATE POLICY "kullanicilar_select_personel"
  ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (
    -- Kendi kaydı
    auth_id = auth.uid()
    OR
    -- Personel personeli görür (müşteri portal kullanıcısı dışında)
    (
      EXISTS (
        SELECT 1 FROM kullanicilar k3
        WHERE k3.auth_id = auth.uid()
          AND COALESCE(k3.tip, 'personel') <> 'musteri'
      )
      AND COALESCE(tip, 'personel') <> 'musteri'
    )
  );

NOTIFY pgrst, 'reload schema';
