-- servis_talepleri tablosuna email kolonu ekle.
-- Musteri portal'da yeni talep formunda telefon disinda email de toplanir,
-- detay sayfalarinda telefon ile birlikte gosterilir.

alter table public.servis_talepleri
  add column if not exists email text;

notify pgrst, 'reload schema';
