-- ═══════════════════════════════════════════════════════════════
-- Tüm public tablolarda RLS zorunlu — Advisor CRITICAL uyarılarını kapat
-- ═══════════════════════════════════════════════════════════════
-- Sorun: Bazı tablolarda RLS enabled olmayabilir → authenticated
-- kullanıcı row-filter olmadan her satırı okuyabiliyor.
-- Fix: her public tablo için:
--   1. RLS enable + force
--   2. Politika yoksa is_staff() only default politika ekle
--   3. Anon rolünden select/insert/update/delete revoke
-- Mevcut politikalara dokunulmaz (koruma altında).
-- View'ler atlanır (relkind='r' filter).
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  t record;
begin
  for t in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'  -- sadece ordinary tables, view/materialized view hariç
    order by c.relname
  loop
    -- 1. RLS zorla aç
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);

    -- 2. Anon rolünün grant'lerini kaldır (defence-in-depth)
    execute format('revoke all on public.%I from anon', t.tablename);
    execute format('revoke all on public.%I from public', t.tablename);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tablename);

    -- 3. Politika hiç yoksa staff-only default ekle
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    ) then
      execute format(
        'create policy "%s_staff_all" on public.%I for all using (is_staff()) with check (is_staff())',
        t.tablename, t.tablename
      );
      raise notice '➕ %: staff-only default policy eklendi', t.tablename;
    else
      raise notice '✓ %: RLS force + mevcut politika korundu', t.tablename;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
