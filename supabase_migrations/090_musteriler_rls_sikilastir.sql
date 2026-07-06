-- ═══════════════════════════════════════════════════════════════
-- KRİTİK GÜVENLİK: musteriler tablosu ANON key ile 1876 satır sızdırıyor!
-- ═══════════════════════════════════════════════════════════════
-- Neden: Ya RLS kapalı, ya da gevşek bir policy anon'a izin veriyor.
-- Bu migration: RLS zorunlu, tüm mevcut politikaları temizle, sıkı
-- yeniden ekle.
-- ═══════════════════════════════════════════════════════════════

-- 1. RLS'i zorla aç ve zorla uygula
alter table musteriler enable row level security;
alter table musteriler force row level security;

-- 2. Mevcut tüm politikaları temizle (temiz slate)
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='musteriler'
  loop
    execute format('drop policy if exists %I on musteriler', pol.policyname);
  end loop;
end $$;

-- 3. Sadece personel (staff) tam CRUD
create policy "musteriler_staff_all"
  on musteriler for all
  using (is_staff())
  with check (is_staff());

-- 4. Müşteri sadece kendi kaydını görebilir
create policy "musteriler_customer_self_select"
  on musteriler for select
  using (id = current_musteri_id());

-- 5. Anon rolüne DOĞRUDAN grant varsa iptal et (RLS bypass için)
revoke all on musteriler from anon;
revoke all on musteriler from public;
grant select, insert, update, delete on musteriler to authenticated;

-- 6. Doğrulama
do $$
declare
  rls_on boolean;
  pol_count int;
begin
  select rowsecurity into rls_on from pg_tables where schemaname='public' and tablename='musteriler';
  select count(*) into pol_count from pg_policies where schemaname='public' and tablename='musteriler';
  raise notice 'musteriler → RLS: %, politika sayısı: %', rls_on, pol_count;
  if not rls_on then
    raise exception 'musteriler RLS hala kapalı! Manuel müdahale gerekli.';
  end if;
end $$;

notify pgrst, 'reload schema';
