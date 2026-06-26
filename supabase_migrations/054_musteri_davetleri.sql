-- B2B musteri portal davet sistemi
--
-- Admin musteri sayfasindan "Portal Davet Gonder" diyince:
--   1. musteri_davetleri'ne yeni satir (random 32-char token, 7 gun son_kullanma)
--   2. Edge function musteri-davet-gonder Resend ile email atar
--   3. Musteri /davet/:token linkine girer -> sifre belirler
--   4. Edge function musteri-davet-kabul auth.users + kullanicilar olusturur
--      (tip=musteri, onay_durum=onayli, musteri_id linkli)
--
-- Token RLS: hicbir client okumaz/yazmaz, sadece service_role (edge fn).

create table if not exists musteri_davetleri (
  id              bigserial primary key,
  token           text not null unique,                    -- 32 char random hex
  email           text not null,                            -- davet edilen
  musteri_id      bigint not null references musteriler(id) on delete cascade,
  ad              text,                                     -- musteri yetkili adi (opsiyonel)
  davet_eden_id   bigint references kullanicilar(id) on delete set null,
  son_kullanma    timestamptz not null default (now() + interval '7 days'),
  kullanildi      boolean not null default false,
  kullanildi_tarih timestamptz,
  olusturma_tarih timestamptz not null default now(),
  meta            jsonb default '{}'::jsonb
);

create index if not exists idx_musteri_davet_token
  on musteri_davetleri(token) where not kullanildi;

create index if not exists idx_musteri_davet_email
  on musteri_davetleri(lower(email));

create index if not exists idx_musteri_davet_musteri
  on musteri_davetleri(musteri_id);

-- RLS: hicbir client direkt erisemez
alter table musteri_davetleri enable row level security;

drop policy if exists "davet_no_client_access" on musteri_davetleri;
create policy "davet_no_client_access" on musteri_davetleri
  for all using (false);

-- Eski expired/kullanilmis davetleri 30 gun sonra temizle (gunluk cron icin)
create or replace function temizle_eski_davetler()
returns void
language sql
security definer
as $$
  delete from musteri_davetleri
   where (kullanildi and kullanildi_tarih < now() - interval '30 days')
      or son_kullanma < now() - interval '30 days';
$$;

grant execute on function temizle_eski_davetler() to service_role;

notify pgrst, 'reload schema';
