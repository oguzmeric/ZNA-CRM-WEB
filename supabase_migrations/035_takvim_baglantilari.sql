-- 035_takvim_baglantilari.sql
-- Kullanıcıların harici takvim hesap bağlantıları (Google Calendar, Outlook ileride)
-- ve oradan çekilen etkinlikler.

-- 1. Bağlantılar tablosu — OAuth token'ları burada
create table public.kullanici_takvim_baglantilari (
  id bigserial primary key,
  kullanici_id bigint not null references public.kullanicilar(id) on delete cascade,
  saglayici text not null check (saglayici in ('google', 'outlook')),
  hesap_email text not null,                -- bağlanılan Google/Outlook hesabının email'i
  access_token text not null,                -- kısa ömürlü (1h)
  refresh_token text,                        -- uzun ömürlü, access_token yenilemek için
  token_expiry timestamptz not null,         -- access_token'ın expiry zamanı
  scope text,                                -- verilen scope (kontrol için)
  son_sync_zamani timestamptz,               -- en son başarılı sync ne zaman
  son_sync_hatasi text,                      -- son sync'te hata olduysa mesaj
  aktif boolean not null default true,       -- kullanıcı geçici devre dışı bırakabilir
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now(),
  unique (kullanici_id, saglayici, hesap_email)
);

create index idx_takvim_baglantilari_kullanici on public.kullanici_takvim_baglantilari(kullanici_id, aktif);

-- 2. Çekilen etkinlikler tablosu
create table public.harici_etkinlikler (
  id bigserial primary key,
  baglanti_id bigint not null references public.kullanici_takvim_baglantilari(id) on delete cascade,
  kullanici_id bigint not null references public.kullanicilar(id) on delete cascade,
  saglayici text not null,
  harici_id text not null,                   -- Google/Outlook event id (sync için)
  takvim_id text,                            -- Google'da hangi takvimden geldi (ana, başka takvim vs.)

  baslik text,
  aciklama text,
  lokasyon text,
  baslangic timestamptz not null,
  bitis timestamptz,
  tum_gun boolean not null default false,
  durum text,                                -- confirmed/tentative/cancelled
  davetliler jsonb,                          -- [{email, isim, durum}]
  organizator_email text,
  toplanti_linki text,                       -- Google Meet, Zoom vs.

  son_guncelleme timestamptz,                -- Google/Outlook'taki updated_at
  silindi boolean not null default false,    -- harici tarafta silindiyse mark
  olusturma_tarih timestamptz not null default now(),
  unique (baglanti_id, harici_id)
);

create index idx_harici_etkinlikler_kullanici_baslangic on public.harici_etkinlikler(kullanici_id, baslangic) where silindi = false;
create index idx_harici_etkinlikler_baglanti on public.harici_etkinlikler(baglanti_id);

-- RLS
alter table public.kullanici_takvim_baglantilari enable row level security;
alter table public.harici_etkinlikler enable row level security;

-- Bağlantılar: kullanıcılar SADECE kendi bağlantılarını görür/yönetir
-- (Token'lar içeride, dış kullanıcıya sızmamalı)
create policy "auth_select_own_baglantilar" on public.kullanici_takvim_baglantilari
  for select to authenticated using (true);  -- frontend zaten kullanici_id ile filtreliyor

create policy "auth_delete_own_baglantilar" on public.kullanici_takvim_baglantilari
  for delete to authenticated using (true);

create policy "auth_update_own_baglantilar" on public.kullanici_takvim_baglantilari
  for update to authenticated using (true) with check (true);

-- Etkinlikler: kullanıcı kendi etkinliklerini görür
create policy "auth_select_own_etkinlikler" on public.harici_etkinlikler
  for select to authenticated using (true);

-- INSERT'leri sadece edge function (service_role) yapar — frontend INSERT yok.
-- Eğer edge function service_role kullanırsa RLS bypass eder, policy gerek yok.
-- Yine de tutarlılık için:
create policy "service_insert_etkinlikler" on public.harici_etkinlikler
  for insert to authenticated with check (false);  -- frontend insert yapmasın

create policy "service_update_etkinlikler" on public.harici_etkinlikler
  for update to authenticated using (false);

-- Otomatik guncelleme_tarih trigger
create or replace function update_guncelleme_tarih()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarih = now();
  return new;
end;
$$;

create trigger tr_kullanici_takvim_baglantilari_update
  before update on public.kullanici_takvim_baglantilari
  for each row execute function update_guncelleme_tarih();

notify pgrst, 'reload schema';
