-- Mobiltek VTS entegrasyonu — token cache + araç snapshot + yetki modülü.

-- 1) Token cache: OAuth2 access_token'ı proxy fonksiyonu burada tutar.
--    Singleton: her zaman en fazla 1 satır. Süresi dolmadan yenilenir.
create table if not exists mobiltek_token_cache (
  id boolean primary key default true check (id),  -- singleton kilidi
  access_token text not null,
  expires_at timestamptz not null,
  guncelleme_tarih timestamptz not null default now()
);

-- 2) Araç snapshot: cron/on-demand her N sn güncellenir.
--    Mobile app önce buraya bakar → yoksa/eskiyse proxy'ye düşer.
create table if not exists mobiltek_araclar (
  id bigint primary key,                    -- Mobiltek vehicleID
  plaka text,
  vin text,
  cihaz_no text,
  son_lat numeric(10, 6),
  son_lng numeric(10, 6),
  hiz numeric(6, 2),
  yon numeric(5, 2),
  motor_durum text,                          -- 'acik' | 'kapali' | 'bilinmiyor'
  gps_zaman timestamptz,
  son_adres text,
  meta jsonb default '{}'::jsonb,
  guncelleme_tarih timestamptz not null default now()
);

create index if not exists idx_mobiltek_araclar_plaka on mobiltek_araclar(plaka);
create index if not exists idx_mobiltek_araclar_guncelleme on mobiltek_araclar(guncelleme_tarih desc);

-- 3) Erişim logu: audit + rate limit için
create table if not exists mobiltek_istek_log (
  id bigserial primary key,
  kullanici_id bigint references kullanicilar(id) on delete set null,
  endpoint text not null,
  parametre jsonb default '{}'::jsonb,
  http_kod int,
  sure_ms int,
  hata text,
  tarih timestamptz not null default now()
);

create index if not exists idx_mobiltek_log_kullanici on mobiltek_istek_log(kullanici_id, tarih desc);

-- 4) RLS — sadece 'arac_takip' modülü olan personel görebilir
alter table mobiltek_araclar enable row level security;
alter table mobiltek_token_cache enable row level security;
alter table mobiltek_istek_log enable row level security;

drop policy if exists "arac_yetkisi_okur" on mobiltek_araclar;
create policy "arac_yetkisi_okur" on mobiltek_araclar
  for select using (
    exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.rol = 'admin' or 'arac_takip' = any(k.moduller))
    )
  );

-- token_cache ve istek_log sadece service_role — proxy fn yazar/okur
drop policy if exists "token_service_only" on mobiltek_token_cache;
drop policy if exists "log_service_only" on mobiltek_istek_log;

-- 5) 'arac_takip' modülünü Oğuz'a ver (admin zaten görür ama modul listesinde de olsun)
update kullanicilar
set moduller = array_append(moduller, 'arac_takip')
where rol = 'admin' and not ('arac_takip' = any(moduller));

notify pgrst, 'reload schema';
