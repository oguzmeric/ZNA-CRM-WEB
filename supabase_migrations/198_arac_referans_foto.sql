-- ============================================================================
-- 198 — Araç Referans Fotoğrafları + Mukayese Kontrolü (2026-07-19 tasarımı)
--
-- Akış: Teknik Müdür Ferdi Kalkan (id 33) her araç için 6 bölgenin REFERANS
-- fotoğrafını çeker → referans TAMAMLANMADAN araç sorumlusu sabah/akşam çekim
-- YAPAMAZ (tam kilit) → Ferdi mukayese ekranında REFERANS|SABAH|AKŞAM yan yana
-- inceler, 'Kontrol Edildi' veya 'Hasar Tespit' işaretler (serbest inceleme,
-- zorunlu kuyruk yok) → hasarda kayıt + bildirim (otomatik görev YOK).
-- Referans yenileme yalnız Ferdi + admin; eski referanslar versiyonlu arşivde.
-- ============================================================================

-- Yetki: arayüz + RLS aynı kuralı kullanır (reference_admin_iki_mekanizma)
create or replace function public.arac_referans_yetkili() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid() and (k.rol = 'admin' or k.id = 33)
  )
$$;

-- ---------------------------------------------------------------------------
-- 1) Referans fotoğraflar — araç × bölge başına TEK aktif kayıt, eskiler arşiv
-- ---------------------------------------------------------------------------
create table if not exists arac_referans_fotolar (
  id uuid primary key default gen_random_uuid(),
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  bolge text not null check (bolge in ('on','arka','sol','sag','kokpit','ic')),
  foto_url text not null,
  versiyon int not null default 1,
  aktif boolean not null default true,
  ceken_id bigint references kullanicilar(id) on delete set null,
  ceken_ad text,
  aciklama text,                -- mevcut/kabul edilmiş hasar notu
  olusturma_tarih timestamptz not null default now()
);

create unique index if not exists uq_arac_referans_aktif
  on arac_referans_fotolar(arac_id, bolge) where aktif = true;
create index if not exists idx_arac_referans_arac on arac_referans_fotolar(arac_id, bolge, versiyon desc);

alter table arac_referans_fotolar enable row level security;

-- Herkes okur (mobil kilit kontrolü + mukayese); yazan yalnız Ferdi + admin
drop policy if exists arac_referans_okur on arac_referans_fotolar;
create policy arac_referans_okur on arac_referans_fotolar
  for select to authenticated using (true);

drop policy if exists arac_referans_yazar on arac_referans_fotolar;
create policy arac_referans_yazar on arac_referans_fotolar
  for all using (arac_referans_yetkili()) with check (arac_referans_yetkili());

-- ---------------------------------------------------------------------------
-- 2) Günlük mukayese kontrolleri — araç × gün başına tek karar
-- ---------------------------------------------------------------------------
create table if not exists arac_foto_kontroller (
  id uuid primary key default gen_random_uuid(),
  arac_id uuid not null references sirket_araclari(id) on delete cascade,
  tarih date not null,
  sonuc text not null check (sonuc in ('temiz','hasar')),
  hasarli_bolgeler text[] not null default '{}',
  notlar text,
  kontrol_eden_id bigint references kullanicilar(id) on delete set null,
  kontrol_eden_ad text,
  olusturma_tarih timestamptz not null default now(),
  constraint uq_arac_kontrol_gun unique (arac_id, tarih)
);

create index if not exists idx_arac_kontrol_tarih on arac_foto_kontroller(tarih desc, arac_id);

alter table arac_foto_kontroller enable row level security;

drop policy if exists arac_kontrol_okur on arac_foto_kontroller;
create policy arac_kontrol_okur on arac_foto_kontroller
  for select to authenticated using (true);

drop policy if exists arac_kontrol_yazar on arac_foto_kontroller;
create policy arac_kontrol_yazar on arac_foto_kontroller
  for all using (arac_referans_yetkili()) with check (arac_referans_yetkili());

-- ---------------------------------------------------------------------------
-- 3) TAM KİLİT — referansı eksik araca günlük foto kaydı DB seviyesinde de
--    reddedilir (istemci kilidi baypas edilemez). Ferdi/admin muaf değildir;
--    önce referans tamamlanır.
-- ---------------------------------------------------------------------------
create or replace function public.arac_foto_referans_kilidi() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_eksik int;
begin
  select 6 - count(distinct bolge) into v_eksik
  from arac_referans_fotolar
  where arac_id = new.arac_id and aktif = true;
  if coalesce(v_eksik, 6) > 0 then
    raise exception 'Bu aracın referans fotoğrafları tamamlanmadı (% bölge eksik) — önce Teknik Müdür referans çekimini yapmalı.', v_eksik;
  end if;
  return new;
end $$;

drop trigger if exists trg_arac_foto_referans_kilidi on arac_foto_kayitlari;
create trigger trg_arac_foto_referans_kilidi before insert on arac_foto_kayitlari
  for each row execute function arac_foto_referans_kilidi();

notify pgrst, 'reload schema';
select 'MIG 198 OK — arac referans foto + kontrol + tam kilit' as sonuc;
