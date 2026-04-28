-- Migration 015: Admin'in başka bir kullanıcının şifresini sıfırlaması için RPC
-- SECURITY DEFINER ile çalışır → caller admin değilse exception fırlatır.

CREATE OR REPLACE FUNCTION admin_sifre_sifirla(hedef_id bigint, yeni_sifre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_unvan text;
  hedef_auth uuid;
BEGIN
  -- Çağıran admin mi?
  SELECT unvan INTO caller_unvan
  FROM kullanicilar
  WHERE auth_id = auth.uid();

  IF lower(COALESCE(caller_unvan, '')) NOT IN ('genel müdür', 'teknik müdür', 'yazılım geliştirmeci') THEN
    RAISE EXCEPTION 'Yetkisiz: yalnızca yöneticiler şifre sıfırlayabilir.';
  END IF;

  -- Şifre minimum uzunluk
  IF length(yeni_sifre) < 6 THEN
    RAISE EXCEPTION 'Şifre en az 6 karakter olmalı.';
  END IF;

  -- Hedef kullanıcının auth_id'si
  SELECT auth_id INTO hedef_auth
  FROM kullanicilar
  WHERE id = hedef_id;

  IF hedef_auth IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı veya auth bağlantısı yok.';
  END IF;

  -- auth.users tablosunda bcrypt ile şifreyi güncelle
  UPDATE auth.users
  SET encrypted_password = crypt(yeni_sifre, gen_salt('bf')),
      updated_at = now()
  WHERE id = hedef_auth;

  -- Legacy kullanicilar.sifre alanı varsa senkron tut
  BEGIN
    UPDATE kullanicilar SET sifre = yeni_sifre WHERE id = hedef_id;
  EXCEPTION
    WHEN undefined_column THEN NULL; -- sifre kolonu yoksa görmezden gel
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_sifre_sifirla(bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
