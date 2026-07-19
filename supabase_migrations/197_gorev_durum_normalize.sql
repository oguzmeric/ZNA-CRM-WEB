-- 197 — durum normalizasyonu: eski mobil sürümler 'devam_ediyor' yazıyor,
-- kanonik değer 'devam' (web/mobil v2 sözlüğü). EAS güncellemesi almamış
-- cihazlar yazmaya devam edebileceği için trigger'la kalıcı normalize edilir.
create or replace function public.gorev_durum_normalize() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.durum = 'devam_ediyor' then new.durum := 'devam'; end if;
  return new;
end $$;

drop trigger if exists trg_gorev_durum_normalize on gorevler;
create trigger trg_gorev_durum_normalize before insert or update on gorevler
  for each row execute function gorev_durum_normalize();

update gorevler set durum = 'devam' where durum = 'devam_ediyor';

notify pgrst, 'reload schema';
select 'MIG 197 OK' as sonuc;
