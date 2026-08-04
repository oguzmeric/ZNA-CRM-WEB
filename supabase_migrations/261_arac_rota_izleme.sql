-- 261 — Araç rota geçmişi + park (P) tespiti (04.08)
--
-- İSTEK: "araçların hangi rotada gittiklerini görmek, park ettikleri yeri P
-- olarak işaretlemek, bu rotaları araç özelinde loglamak".
--
-- ⭐ TESPİT: Rota için gereken veri ZATEN 5 dk'da bir elimize geliyordu
-- (mobiltek-kontak-izle → v1/vehicles/ → last-location). Ama saklanmıyordu:
-- mobiltek_kontak_durumlari araç başına TEK satır tutuyor, her taramada
-- üzerine yazılıyordu. Rota, oluşmadan siliniyordu. Bu migration eksik olan
-- tek şeyi ekliyor: tarihçe.
--
-- ⭐ MOBİLTEK'İN KENDİ GEÇMİŞİ KAPALI (04.08 canlı test):
--   v1/vehicles/location-logs/{id}  → 401 Unauthorized  (uç VAR, yetkimiz yok)
--   v1/drivers                      → 401 Unauthorized  (uç VAR, yetkimiz yok)
--   olmayan bir yol                 → 404               (ayrım kesin)
-- Yani Mobiltek'te geçmiş rota kaydı duruyor, hesabımıza açılmamış. Bayiden
-- bu iki ucun yetkisi istenirse GEÇMİŞE DÖNÜK rotalar da gelir. Bu migration
-- ona bağımlı değil — bugünden itibaren kendi kaydımızı tutar.
--
-- KARARLAR (kullanıcı onayı, 04.08):
--   • Kayıt sıklığı : 2 dakika  (5 dk'da şehir içi rota kuş uçuşu çıkıyor)
--   • Görünürlük    : yönetim   (admin + arac_takip modülü) — çalışan konum
--                     takibi olduğu için KVKK açısından dar kapı
--   • Saklama       : izler 90 gün, park kayıtları 365 gün

begin;

-- ── 1) Ham konum izleri ────────────────────────────────────────────────
create table if not exists public.arac_konum_izleri (
  id            bigserial primary key,
  arac_id       bigint not null,          -- Mobiltek araç id
  plaka         text,
  enlem         double precision not null,
  boylam        double precision not null,
  hiz           numeric(6,2),             -- km/s
  yon           smallint,                 -- 0-360 derece
  kontak        boolean not null default false,
  adres         text,
  il            text,
  ilce          text,
  olcum_zamani  timestamptz not null,     -- Mobiltek logdatetime (GPS anı)
  kayit_zamani  timestamptz not null default now()
);

comment on table public.arac_konum_izleri is
  'Araç GPS iz geçmişi — 2 dk''da bir mobiltek-rota-kaydet edge fn yazar. Rota çizimi bu tablodan.';

create index if not exists ix_konum_iz_arac_zaman
  on public.arac_konum_izleri (arac_id, olcum_zamani desc);

-- Aynı GPS anı iki kez yazılmasın: araç dururken cihaz aynı logdatetime'ı
-- tekrar raporlar; edge fn "on conflict do nothing" ile geçer.
create unique index if not exists ux_konum_iz_arac_olcum
  on public.arac_konum_izleri (arac_id, olcum_zamani);

-- ── 2) Park (P) kayıtları ──────────────────────────────────────────────
-- Park = kontak kapalı + hız 0 (mevcut kontak mantığıyla birebir aynı:
-- Mobiltek'in ignition alanı güvenilmez olduğu için "ign truthy VEYA hız>0"
-- kontak sayılır → ikisi de yoksa araç park halindedir).
-- 3 dakikadan kısa duraklamalar (trafik ışığı) kaydedilmez — kapanışta silinir.
create table if not exists public.arac_park_kayitlari (
  id          bigserial primary key,
  arac_id     bigint not null,
  plaka       text,
  enlem       double precision not null,
  boylam      double precision not null,
  adres       text,
  il          text,
  ilce        text,
  baslangic   timestamptz not null,
  bitis       timestamptz,                -- null = araç hâlâ burada park halinde
  sure_dk     integer,                    -- bitişte hesaplanır
  guncelleme  timestamptz not null default now()
);

comment on table public.arac_park_kayitlari is
  'Araç park duraklamaları — haritada P işareti. bitis null = hâlâ park halinde.';

-- Araç başına en fazla BİR açık park olabilir
create unique index if not exists ux_park_acik
  on public.arac_park_kayitlari (arac_id) where bitis is null;

create index if not exists ix_park_arac_bas
  on public.arac_park_kayitlari (arac_id, baslangic desc);

-- ── 3) Araç başına son iz durumu (edge fn'in çalışma belleği) ──────────
-- Her taramada "bu araç önceki noktadan ne kadar uzaklaşmış?" sorusunu tek
-- sorguda cevaplamak için. Bu olmadan her araç için ayrı "son iz" sorgusu
-- gerekirdi.
create table if not exists public.arac_iz_durumu (
  arac_id     bigint primary key,
  plaka       text,
  son_enlem   double precision,
  son_boylam  double precision,
  son_olcum   timestamptz,                -- son işlenen GPS anı
  son_yazim   timestamptz,                -- izler tablosuna en son ne zaman satır yazıldı
  guncelleme  timestamptz not null default now()
);

-- ── 4) RLS — okuma yalnız yönetim (admin veya arac_takip modülü) ───────
-- ⚠️ auth.uid() (select ...) ile sarmalı: sarmalanmazsa her satır için
-- yeniden çalışır (RLS initplan tuzağı — bkz. mig 227/228).
alter table public.arac_konum_izleri   enable row level security;
alter table public.arac_park_kayitlari enable row level security;
alter table public.arac_iz_durumu      enable row level security;

drop policy if exists rota_iz_oku on public.arac_konum_izleri;
create policy rota_iz_oku on public.arac_konum_izleri
  for select using (
    exists (
      select 1 from public.kullanicilar k
      where k.auth_id = (select auth.uid())
        and coalesce(k.hesap_silindi, false) = false
        and (k.rol = 'admin' or 'arac_takip' = any(k.moduller))
    )
  );

drop policy if exists rota_park_oku on public.arac_park_kayitlari;
create policy rota_park_oku on public.arac_park_kayitlari
  for select using (
    exists (
      select 1 from public.kullanicilar k
      where k.auth_id = (select auth.uid())
        and coalesce(k.hesap_silindi, false) = false
        and (k.rol = 'admin' or 'arac_takip' = any(k.moduller))
    )
  );

-- iz_durumu edge fn'in iç defteri — arayüzde gösterilmez, kimse okumaz.
-- (RLS açık + policy yok = service_role dışında erişim yok.)

-- ── 5) Cron: her 2 dakikada bir konum kaydet ───────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'mobiltek-rota-cron') then
    perform cron.unschedule('mobiltek-rota-cron');
  end if;
end $$;

-- ⚠️ Secret LİTERAL yazılıyor: current_setting('app.esn_cron_secret') DB
-- seviyesinde tanımlı DEĞİL ve Management API rolü GUC set edemiyor (42501).
-- Bkz. mig 148 — aynı sebeple 5 cron işi sessizce 401 alıyordu.
select cron.schedule(
  'mobiltek-rota-cron',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/mobiltek-rota-kaydet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', 'c1f94777cbab0a9b529ab94efd60381863366cd36b2d4559'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- ── 6) Saklama temizliği — her gece 03:20 ──────────────────────────────
do $$ begin
  if exists (select 1 from cron.job where jobname = 'arac-rota-temizlik') then
    perform cron.unschedule('arac-rota-temizlik');
  end if;
end $$;

select cron.schedule(
  'arac-rota-temizlik',
  '20 3 * * *',
  $cron$
    delete from public.arac_konum_izleri   where olcum_zamani < now() - interval '90 days';
    delete from public.arac_park_kayitlari where bitis is not null and bitis < now() - interval '365 days';
  $cron$
);

notify pgrst, 'reload schema';

commit;

select 'tablolar: ' || count(*)::text as kurulum
from information_schema.tables
where table_schema = 'public'
  and table_name in ('arac_konum_izleri','arac_park_kayitlari','arac_iz_durumu')
union all
select 'cron: ' || string_agg(jobname || ' (' || schedule || ')', ', ')
from cron.job where jobname in ('mobiltek-rota-cron','arac-rota-temizlik');
