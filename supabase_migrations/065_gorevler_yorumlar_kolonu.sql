-- Görevler yorumlar kolonu — GorevDetay'da yorum ekleme sessizce başarısız oluyordu.
-- Frontend yorumları jsonb array olarak yazıyor: [{id, yazar, yazarId, icerik, tarih}, ...]

alter table public.gorevler
  add column if not exists yorumlar jsonb not null default '[]'::jsonb;

-- PostgREST cache'ini yenile ki hemen kullanılabilsin
notify pgrst, 'reload schema';
