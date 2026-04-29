-- Migration 019: 018'in recursive RLS sorununu düzelt
-- Policy içinde kullanicilar tablosunu sorgulamak recursive bloka yol açıyor.
-- SECURITY DEFINER fonksiyonu ile RLS'i bypass ederek admin/personel kontrolü yapıyoruz.

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

-- Eski policy'leri sil
DROP POLICY IF EXISTS "kullanicilar_select_admin" ON kullanicilar;
DROP POLICY IF EXISTS "kullanicilar_select_personel" ON kullanicilar;

-- Yeni: tek policy, fonksiyonları kullanır
CREATE POLICY "kullanicilar_select_v2"
  ON kullanicilar
  FOR SELECT
  TO authenticated
  USING (
    -- Kendi kaydı her zaman görünür
    auth_id = auth.uid()
    -- VEYA admin tüm personeli görür
    OR is_admin()
    -- VEYA personel başka personeli görür (müşteri portal hariç)
    OR (is_personel() AND COALESCE(tip, 'personel') <> 'musteri')
  );

NOTIFY pgrst, 'reload schema';
