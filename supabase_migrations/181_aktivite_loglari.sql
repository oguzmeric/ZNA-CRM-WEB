-- 181 — Aktivite logları localStorage → DB
--
-- SORUN: aktivite logları tarayıcı localStorage'ında tutuluyordu (cihaz-yerel).
-- Admin başka kullanıcıların aktivitesini ASLA göremiyordu; herkes yalnız kendi
-- tarayıcısındaki kaydı görüyordu. DB tablosuna taşıyoruz: admin hepsini,
-- personel kendisininkini görür.

create table if not exists aktivite_loglari (
  id              bigint generated always as identity primary key,
  kullanici_id    bigint references kullanicilar(id) on delete cascade,
  kullanici_ad    text,
  tip             text not null,           -- kullanici_giris | kullanici_cikis | sayfa_giris | sayfa_cikis
  sayfa           text,
  sure_saniye     integer,
  aciklama        text,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists idx_aktivite_kullanici_tarih on aktivite_loglari (kullanici_id, olusturma_tarih desc);
create index if not exists idx_aktivite_tarih           on aktivite_loglari (olusturma_tarih desc);

alter table aktivite_loglari enable row level security;

-- INSERT: personel yalnız KENDİ id'siyle log yazabilir (impersonation önlenir)
drop policy if exists aktivite_insert_own on aktivite_loglari;
create policy aktivite_insert_own on aktivite_loglari
  for insert with check (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

-- SELECT: admin HEPSİNİ, personel yalnız kendisininkini görür
drop policy if exists aktivite_select on aktivite_loglari;
create policy aktivite_select on aktivite_loglari
  for select using (
    is_admin()
    or kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

-- Admin her şey (temizleme/silme için)
drop policy if exists aktivite_admin_all on aktivite_loglari;
create policy aktivite_admin_all on aktivite_loglari
  for all using (is_admin()) with check (is_admin());

-- Retention: 90 günden eski logları gece 03:00'te sil (best-effort, cron yoksa atlanır)
do $$
begin
  begin perform cron.unschedule('aktivite-log-temizle'); exception when others then null; end;
  begin
    perform cron.schedule('aktivite-log-temizle', '0 3 * * *',
      'delete from aktivite_loglari where olusturma_tarih < now() - interval ''90 days''');
  exception when others then null; end;
end $$;

notify pgrst, 'reload schema';
