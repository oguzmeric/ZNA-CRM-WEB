-- Migration 021: pgcrypto extension (gen_salt, crypt için)
-- 015 admin_sifre_sifirla bcrypt için gen_salt'a ihtiyaç duyuyor

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Fonksiyonun search_path'ine extensions'ı ekle
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

  IF lower(COALESCE(caller_unvan, '')) NOT IN ('teknik müdür', 'genel müdür', 'yazılım geliştirmeci') THEN
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

NOTIFY pgrst, 'reload schema';
