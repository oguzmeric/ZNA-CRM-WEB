-- Migration 022: 'Genel Müdür Yardımcısı' unvanına admin yetkisi
-- is_admin() ve admin_sifre_sifirla() RPC'leri bu unvanı tanısın

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
      AND lower(unvan) IN (
        'teknik müdür', 'genel müdür', 'genel müdür yardımcısı', 'yazılım geliştirmeci'
      )
  );
$$;

CREATE OR REPLACE FUNCTION admin_sifre_sifirla(hedef_id bigint, yeni_sifre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_unvan text;
  hedef_auth uuid;
BEGIN
  SELECT unvan INTO caller_unvan
  FROM kullanicilar
  WHERE auth_id = auth.uid();

  IF lower(COALESCE(caller_unvan, '')) NOT IN (
    'teknik müdür', 'genel müdür', 'genel müdür yardımcısı', 'yazılım geliştirmeci'
  ) THEN
    RAISE EXCEPTION 'Yetkisiz: yalnızca yöneticiler şifre sıfırlayabilir.';
  END IF;

  IF length(yeni_sifre) < 6 THEN
    RAISE EXCEPTION 'Şifre en az 6 karakter olmalı.';
  END IF;

  SELECT auth_id INTO hedef_auth
  FROM kullanicilar
  WHERE id = hedef_id;

  IF hedef_auth IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı veya auth bağlantısı yok.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(yeni_sifre, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = hedef_auth;

  BEGIN
    UPDATE kullanicilar SET sifre = yeni_sifre WHERE id = hedef_id;
  EXCEPTION
    WHEN undefined_column THEN NULL;
  END;
END;
$$;

-- menu_yetkileri policy
DROP POLICY IF EXISTS "menu_yetkileri_write_admin" ON menu_yetkileri;
CREATE POLICY "menu_yetkileri_write_admin"
  ON menu_yetkileri
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
