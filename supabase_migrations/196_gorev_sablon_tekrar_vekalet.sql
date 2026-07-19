-- ============================================================================
-- 196 — Görev modülü otomasyon katmanı (F5)
-- Spek madde 25 (hatırlatmalar), 26 (geciken yönetimi), 28 (tekrarlayan),
-- 29 (şablonlar), 39 (vekâlet). İdempotent.
--
--   1) gorev_sablonlari  — ana görev + alt görevler + kontrol listesi şablonu
--   2) gorev_tekrarlar   — tekrarlayan görev tanımları (cron sabah üretir)
--   3) gorev_vekaletler  — izinli personelin vekili
--   4) gorev-gunluk-cron — 05:30 UTC (08:30 TR) her gün → gorev-gunluk-tara fn
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Görev şablonları (madde 29)
--    veri jsonb: { gorev: {baslik, aciklama, oncelik, kategoriId, sureGun,
--                  onayGerekli, tamamlamaKurali, beklenenCikti, etiketler},
--                  altGorevler: [{baslik, aciklama, oncelik, sureGun, zorunlu,
--                  atananId?}], kontrolListesi: [{baslik, zorunlu}] }
-- ---------------------------------------------------------------------------
create table if not exists gorev_sablonlari (
  id bigserial primary key,
  ad text not null,
  aciklama text,
  veri jsonb not null default '{}'::jsonb,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz
);

alter table gorev_sablonlari enable row level security;

drop policy if exists gorev_sablon_select on gorev_sablonlari;
create policy gorev_sablon_select on gorev_sablonlari for select using (is_staff());

drop policy if exists gorev_sablon_insert on gorev_sablonlari;
create policy gorev_sablon_insert on gorev_sablonlari
  for insert with check (is_staff());

drop policy if exists gorev_sablon_update on gorev_sablonlari;
create policy gorev_sablon_update on gorev_sablonlari
  for update using (
    is_admin() or exists (
      select 1 from kullanicilar k where k.auth_id = auth.uid() and k.id = gorev_sablonlari.olusturan_id)
  );

drop policy if exists gorev_sablon_delete on gorev_sablonlari;
create policy gorev_sablon_delete on gorev_sablonlari
  for delete using (
    is_admin() or exists (
      select 1 from kullanicilar k where k.auth_id = auth.uid() and k.id = gorev_sablonlari.olusturan_id)
  );

-- ---------------------------------------------------------------------------
-- 2) Tekrarlayan görevler (madde 28)
--    siklik: gunluk | haftalik | aylik | yillik
--    gunler: haftalik → ISO gün no listesi (1=Pzt..7=Paz); aylik → ayın günleri
--            (32 = "ayın son iş günü" özel değeri); diğerlerinde boş
--    sablon jsonb: gorev_sablonlari.veri ile aynı biçim + atananId zorunlu
-- ---------------------------------------------------------------------------
create table if not exists gorev_tekrarlar (
  id bigserial primary key,
  ad text not null,
  sablon jsonb not null default '{}'::jsonb,
  siklik text not null default 'haftalik',
  gunler int[] not null default '{}',
  sonraki_uretim date,
  son_uretim date,
  aktif boolean not null default true,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_tekrar_siklik') then
    alter table gorev_tekrarlar add constraint chk_gorev_tekrar_siklik
      check (siklik in ('gunluk', 'haftalik', 'aylik', 'yillik'));
  end if;
end $$;

alter table gorev_tekrarlar enable row level security;

drop policy if exists gorev_tekrar_select on gorev_tekrarlar;
create policy gorev_tekrar_select on gorev_tekrarlar for select using (is_staff());

drop policy if exists gorev_tekrar_yaz on gorev_tekrarlar;
create policy gorev_tekrar_yaz on gorev_tekrarlar
  for all using (
    is_admin() or exists (
      select 1 from kullanicilar k where k.auth_id = auth.uid() and k.id = gorev_tekrarlar.olusturan_id)
  ) with check (is_staff());

-- ---------------------------------------------------------------------------
-- 3) Vekâlet (madde 39)
-- ---------------------------------------------------------------------------
create table if not exists gorev_vekaletler (
  id bigserial primary key,
  kullanici_id bigint not null references kullanicilar(id) on delete cascade,
  vekil_id bigint not null references kullanicilar(id) on delete cascade,
  baslangic date not null default current_date,
  bitis date,
  aciklama text,
  aktif boolean not null default true,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz not null default now(),
  constraint chk_vekalet_farkli check (kullanici_id <> vekil_id)
);

alter table gorev_vekaletler enable row level security;

drop policy if exists gorev_vekalet_select on gorev_vekaletler;
create policy gorev_vekalet_select on gorev_vekaletler for select using (is_staff());

-- Vekâleti admin veya kişinin kendisi tanımlar
drop policy if exists gorev_vekalet_yaz on gorev_vekaletler;
create policy gorev_vekalet_yaz on gorev_vekaletler
  for all using (
    is_admin() or exists (
      select 1 from kullanicilar k where k.auth_id = auth.uid() and k.id = gorev_vekaletler.kullanici_id)
  ) with check (
    is_admin() or exists (
      select 1 from kullanicilar k where k.auth_id = auth.uid() and k.id = gorev_vekaletler.kullanici_id)
  );

create index if not exists idx_gorev_vekalet_kisi on gorev_vekaletler(kullanici_id) where aktif = true;
create index if not exists idx_gorev_tekrar_uretim on gorev_tekrarlar(sonraki_uretim) where aktif = true;

-- ---------------------------------------------------------------------------
-- 4) Günlük görev otomasyon cron'u — 05:30 UTC = 08:30 TR, her gün
--    (tekrarlayan görev üretimi hafta sonu da çalışmalı)
-- ---------------------------------------------------------------------------
select cron.unschedule('gorev-gunluk-cron')
where exists (select 1 from cron.job where jobname = 'gorev-gunluk-cron');

select cron.schedule(
  'gorev-gunluk-cron',
  '30 5 * * *',
  $$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/gorev-gunluk-tara',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select deger from private.app_settings where anahtar = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
  $$
);

notify pgrst, 'reload schema';
select 'MIG 196 OK — sablon + tekrar + vekalet + cron' as sonuc;
