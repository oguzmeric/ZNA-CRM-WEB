-- Migration 020: Login'i kurtaran self-contained RLS düzeltme
-- Hem fonksiyonları tanımlar (yoksa) hem policy'leri yeniden kurar.

-- 1) Helper fonksiyonlar (SECURITY DEFINER ile RLS bypass)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kullanicilar
    WHERE auth_id = auth.uid()
      AND lower(unvan) IN ('teknik müdür', 'genel müdür', 'yazılım geliştirmeci')
  );
$$;

CREATE OR REPLACE FUNCTION is_personel()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kullanicilar
    WHERE auth_id = auth.uid()
      AND COALESCE(tip, 'personel') <> 'musteri'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_personel() TO authenticated;

-- 2) 018-019'daki bozuk policy'leri sil
DROP POLICY IF EXISTS "kullanicilar_select_v2" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_select_admin" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_select_personel" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_self_select" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_admin_select_all" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_personel_select_personel" ON kullanicilar;

-- 3) Doğru policy'ler
-- Kendi kaydını her zaman görür (login için ŞART)
CREATE POLICY "kullanicilar_self_select" ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- Admin tüm kullanıcıları görür
CREATE POLICY "kullanicilar_admin_select_all" ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Personel başka personeli görür (müşteri portal hariç)
CREATE POLICY "kullanicilar_personel_select_personel" ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (
    is_personel()
    AND COALESCE(tip, 'personel') <> 'musteri'
  );

NOTIFY pgrst, 'reload schema';
