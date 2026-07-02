-- Müşteri vergi dairesi alanı — form/liste/detay için.

alter table public.musteriler
  add column if not exists vergi_dairesi text;

notify pgrst, 'reload schema';
