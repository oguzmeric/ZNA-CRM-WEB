-- Müşteri açık adres alanı — form/liste/detay ekranlarında kullanılacak.

alter table public.musteriler
  add column if not exists adres text;

notify pgrst, 'reload schema';
