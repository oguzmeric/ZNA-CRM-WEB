-- 096: Tüm public fonksiyonların search_path'ini sabitler
-- Advisor: "Function Search Path Mutable" (86 warning) → 0
-- Etki: davranış değişmez, sadece function-owned schema resolution sabitlenir
-- Güvenlik: schema-hijack / SECURITY DEFINER yetki-yükseltme saldırılarına karşı koruma

DO $$
DECLARE
  r RECORD;
  fixed_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.oid,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')  -- normal function + procedure (aggregate/window hariç)
      AND NOT EXISTS (
        -- search_path zaten set edilmiş fonksiyonları atla
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
        r.schema_name, r.func_name, r.args
      );
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
      RAISE NOTICE 'Atlandı: %.%(%) — %', r.schema_name, r.func_name, r.args, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Düzeltilen: %, Atlanan: %', fixed_count, skipped_count;
END $$;
