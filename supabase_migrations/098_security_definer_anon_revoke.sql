-- 098: SECURITY DEFINER fonksiyonlarını anon'dan kilitle
-- Advisor: "Public Can Execute SECURITY DEFINER Function" → 0 (whitelist hariç)
--
-- Strateji:
--   1) public şemasındaki TÜM fonksiyonlardan anon+public EXECUTE'u revoke et
--   2) authenticated'a EXECUTE ver
--   3) WHITELIST'e (login-öncesi/public flow) anon'a explicit grant geri ver
--
-- Whitelist mantığı:
--   - Login öncesi çağrılanlar (kullanıcı henüz auth olmadı)
--   - Public route'lardan çağrılanlar (/p/:token)
--   - RLS helper'ları (NULL döner, yan etki yok — RLS içinden çağrılıyor)
--
-- Trigger fonksiyonları da revoke edilir; trigger'lar fn sahibinin yetkisiyle
-- koşar, EXECUTE grant'e ihtiyaç duymaz.

-- ══════════════════════════════════════════════════════════════════════
-- ADIM 1: TÜM public fonksiyonlardan anon+public EXECUTE revoke
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
  revoke_count INT := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                     r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                     r.proname, r.args);
      revoke_count := revoke_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Atlandı: %(%) — %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Toplam işlenen: %', revoke_count;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- ADIM 2: WHITELIST — anon'a explicit grant geri ver
-- ══════════════════════════════════════════════════════════════════════

-- ── Login flow (auth öncesi) ─────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  whitelist TEXT[] := ARRAY[
    'giris_denemesi_kaydet',
    'giris_kilit_saniye',
    'kullanici_adi_email_cozumle',
    'paylasim_link_dogrula',
    'paylasim_teklif_oku',
    'paylasim_servis_oku',
    -- RLS helper'ları — NULL döner, yan etki yok
    'current_kullanici_id',
    'current_musteri_id',
    'current_user_profile',
    'current_user_role'
  ];
BEGIN
  FOR r IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(whitelist)
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
                     r.proname, r.args);
      RAISE NOTICE 'Anon whitelist: %(%)', r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Whitelist grant atlandı: %(%) — %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- KONTROL — hangi fonksiyonlar hâlâ anon-executable?
-- ══════════════════════════════════════════════════════════════════════
-- SELECT p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND has_function_privilege('anon', p.oid, 'EXECUTE')
-- ORDER BY p.proname;
