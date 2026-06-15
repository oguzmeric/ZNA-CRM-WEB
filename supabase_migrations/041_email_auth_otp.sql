-- Email tabanli auth icin OTP (6 haneli kod) tablosu + kullanicilar.email kolonu duzeni.
--
-- Akis:
--   1. Kullanici email girer -> kayit-kod-gonder edge function 6 haneli kod uretip
--      bu tabloya yazar ve email gonderir.
--   2. Kullanici kodu girer -> kayit-kod-dogrula edge function tabloya bakip kontrol eder.
--   3. Dogru ise auth.users + kullanicilar kaydi olusturulur.

create table if not exists email_dogrulama_kodlari (
  id              bigserial primary key,
  email           text not null,
  kod             text not null,                       -- 6 haneli, ornek '837492'
  amac            text not null check (amac in ('kayit', 'sifre_sifirla', 'email_degistir')),
  son_kullanma    timestamptz not null default (now() + interval '10 minutes'),
  kullanildi      boolean not null default false,
  deneme_sayisi   smallint not null default 0,          -- 5 yanlis denemede kilitlenir
  olusturma_tarih timestamptz not null default now(),
  ip_adresi       text,                                 -- audit icin (opsiyonel)
  meta            jsonb default '{}'::jsonb
);

create index if not exists idx_email_otp_email_amac
  on email_dogrulama_kodlari(email, amac) where not kullanildi;

create index if not exists idx_email_otp_son_kullanma
  on email_dogrulama_kodlari(son_kullanma) where not kullanildi;

-- RLS: hicbir client direkt okuyamaz/yazamaz. Sadece edge function (service_role) erisir.
alter table email_dogrulama_kodlari enable row level security;

drop policy if exists "email_otp_no_client_access" on email_dogrulama_kodlari;
create policy "email_otp_no_client_access" on email_dogrulama_kodlari
  for all using (false);

-- Eski kullanilmis/expired kodlari temizle (gunluk cron icin)
create or replace function temizle_eski_otp_kodlar()
returns void
language sql
security definer
as $$
  delete from email_dogrulama_kodlari
   where (kullanildi and olusturma_tarih < now() - interval '1 day')
      or son_kullanma < now() - interval '1 day';
$$;

grant execute on function temizle_eski_otp_kodlar() to service_role;

-- ============================================================================
-- kullanicilar.email kolonu — gercek email tutsun (zaten var olabilir, idempotent)
-- ============================================================================
alter table kullanicilar
  add column if not exists email_dogrulandi boolean not null default false;

-- email_dogrulandi true ise kullanici signup'i tamamlamis demektir.
-- Eski @zna.local emaillere sahip kullanicilar icin migration ayri yapilir
-- (admin paneli uzerinden 'email assign et + davet maili gonder').

create index if not exists idx_kullanicilar_email
  on kullanicilar(lower(email)) where email is not null;

notify pgrst, 'reload schema';
