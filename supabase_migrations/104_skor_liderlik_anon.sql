-- 104: skor_liderlik RPC'sini tekrar anon whitelist'e ekle.
-- /skor kiosk modu login-siz (ofis ekranında canlı gösterim). Migration 098'de
-- yanlışlıkla whitelist dışına düşmüştü.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'skor_liderlik'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
    RAISE NOTICE 'Anon whitelist eklendi: %(%)', r.proname, r.args;
  END LOOP;
END $$;
