-- 111: Zimmet & Envanter yetkilileri
-- Oğuz Meriç, Ali Uğur Aktepe, Ferdi Kalkan admin rolüne alınır.
-- Böylece demirbaş ekleme/iade RLS'i (migration 109) INSERT/UPDATE'e izin verir.

update kullanicilar
set rol = 'admin'
where (
  ad ilike '%oğuz%meriç%'
  or ad ilike '%oguz%meric%'
  or ad ilike '%ali%uğur%aktepe%'
  or ad ilike '%ali%ugur%aktepe%'
  or ad ilike '%ferdi%kalkan%'
)
and (rol is null or rol <> 'admin');

notify pgrst, 'reload schema';
