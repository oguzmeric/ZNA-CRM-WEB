-- ═══════════════════════════════════════════════════════════════
-- RLS SIKI GEÇİRME — 9 savunmasız tablo
-- ═══════════════════════════════════════════════════════════════
-- ANON key ile SELECT yapılabilen boş tablolar:
--   aktivite_log, demo_cihazlari, demo_cihazlari_durum,
--   demo_zimmet_kayitlari, firmalar, mobiltek_token_cache,
--   musteri_davetleri, servis_kalem_kullanimi, tahsilatlar
-- Şu an boş ama veri girildiğinde herkese açık olurdu.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  tbl text;
  savunmasiz text[] := array[
    'aktivite_log', 'demo_cihazlari',
    -- demo_cihazlari_durum: VIEW → RLS almaz, base tablodan devralır
    'demo_zimmet_kayitlari', 'firmalar', 'mobiltek_token_cache',
    'musteri_davetleri', 'servis_kalem_kullanimi', 'tahsilatlar'
  ];
  pol record;
begin
  foreach tbl in array savunmasiz loop
    -- 1. RLS zorla aç + force
    execute format('alter table %I enable row level security', tbl);
    execute format('alter table %I force row level security', tbl);

    -- 2. Anon rolünden tüm grant'leri kaldır
    execute format('revoke all on %I from anon', tbl);
    execute format('revoke all on %I from public', tbl);
    execute format('grant select, insert, update, delete on %I to authenticated', tbl);

    -- 3. Mevcut politikaları temizle (çakışma önlemek için)
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on %I', pol.policyname, tbl);
    end loop;

    -- 4. Staff-only politika ekle (varsayılan)
    execute format(
      'create policy "%s_staff_all" on %I for all using (is_staff()) with check (is_staff())',
      tbl, tbl
    );

    raise notice '✅ %: RLS sıkılaştırıldı', tbl;
  end loop;
end $$;

-- musteri_davetleri: müşteriye davet gönderirken edge fn (service role) kullanılıyor,
-- ancak davetiye linkine tıklayan public kullanıcı için özel policy gerekebilir.
-- Şimdilik staff_all + service_role bypass ile idare eder. Edge fn service_role kullanıyorsa sorun yok.

notify pgrst, 'reload schema';
