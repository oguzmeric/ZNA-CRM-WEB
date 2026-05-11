-- 038_takvim_etkinlik_olusturma.sql
-- CRM içinden Google Calendar etkinliği oluşturma (+ Meet linki) için ek alanlar.

-- harici_etkinlikler: CRM'den oluşturulduğunu mark eden flag + Meet event id alanı
alter table public.harici_etkinlikler
  add column if not exists crm_olusturuldu boolean not null default false,
  add column if not exists meet_konferans_id text;  -- Google'ın döndürdüğü conferenceId

-- INSERT policy: artık edge function (service role) buradan event yazacak.
-- Service role zaten RLS bypass ediyor; policy değişikliği yok ama yorumu güncelle.

-- Bağlantı tablosuna ufak yorum güncelleme yok, mevcut yapı yeterli.

notify pgrst, 'reload schema';
