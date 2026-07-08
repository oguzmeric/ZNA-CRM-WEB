-- ═══════════════════════════════════════════════════════════════
-- Araç yakınlık alarmı — 2 aracın 150m/15dk beraber durması → alarm
-- ═══════════════════════════════════════════════════════════════
-- Kullanım: arac-yakinlik-tara edge fn her 30 sn Mobiltek'ten pozisyonları
-- çeker, 150m altındaki çiftleri bu tabloya upsert eder. Süre 15 dk'yı
-- geçince alarm_verildi=true yapıp bildirimler tablosuna kayıt atar.
-- ═══════════════════════════════════════════════════════════════

create table if not exists arac_yakinlik_kayitlari (
  id bigserial primary key,
  arac1_id int not null,
  arac1_plaka text,
  arac2_id int not null,
  arac2_plaka text,
  ilk_zaman timestamptz not null default now(),
  son_zaman timestamptz not null default now(),
  ortalama_mesafe_m int,
  son_mesafe_m int,
  ornek_sayisi int not null default 1,
  ilk_lat double precision,
  ilk_lng double precision,
  son_lat double precision,
  son_lng double precision,
  son_adres text,
  alarm_verildi boolean not null default false,
  alarm_zamani timestamptz,
  cozuldu boolean not null default false,
  cozuldu_zamani timestamptz,
  -- Aynı çifti tekrar açmasın (aktif kayıt tekildir)
  constraint arac_yakinlik_ciftlik_ck check (arac1_id < arac2_id)
);

-- Aktif (çözülmemiş) çift için tekillik
create unique index if not exists arac_yakinlik_aktif_cift_idx
  on arac_yakinlik_kayitlari (arac1_id, arac2_id)
  where cozuldu = false;

create index if not exists arac_yakinlik_son_zaman_idx
  on arac_yakinlik_kayitlari (son_zaman desc);

create index if not exists arac_yakinlik_alarm_idx
  on arac_yakinlik_kayitlari (alarm_verildi, cozuldu);

-- ─── RLS ──────────────────────────────────────────────────────
alter table arac_yakinlik_kayitlari enable row level security;
alter table arac_yakinlik_kayitlari force row level security;
revoke all on arac_yakinlik_kayitlari from anon, public;
grant select, insert, update, delete on arac_yakinlik_kayitlari to authenticated;

-- Sadece yönetim rolündekiler görebilir (admin veya arac_takip yetkisi olan)
drop policy if exists yakinlik_yonetim_read on arac_yakinlik_kayitlari;
create policy yakinlik_yonetim_read on arac_yakinlik_kayitlari
  for select using (
    exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.rol = 'admin' or 'arac_takip' = any(k.moduller))
    )
  );

notify pgrst, 'reload schema';
