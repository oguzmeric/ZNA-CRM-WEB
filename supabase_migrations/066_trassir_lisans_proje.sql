-- Trassir lisanslara "proje" alanı — aynı müşterinin çok sayıda lisansı
-- olabilir; hangi projeye ait olduğunu ayırt etmek için kısa metin alanı.

alter table public.trassir_lisanslar
  add column if not exists proje text;

notify pgrst, 'reload schema';
