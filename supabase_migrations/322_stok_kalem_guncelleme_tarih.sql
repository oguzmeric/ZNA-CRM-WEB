-- 322 — stok_kalemleri.guncelleme_tarih UPDATE'te OTOMATİK yenilensin.
--
-- BULGU (21.08 "Depoya Çek çalışmıyor hissi" teşhisi): buton ÇALIŞIYOR
-- (canlı ölçüm: Salih 29→17 kalem, çekilenler depoda+teknisyen_id null).
-- Ama guncelleme_tarih 28.07'de KALIYORDU — hiçbir yazma yolu kolonu set
-- etmiyor, trigger da yoktu. Ekranlar bu tarihi gösterip buna göre
-- sıraladığından işlem "olmamış" hissi veriyordu; denetim izi de yanlıştı.

begin;

create or replace function public.stok_kalem_guncelleme_tarih()
returns trigger
language plpgsql
as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists tr_stok_kalem_guncelleme_tarih on public.stok_kalemleri;
create trigger tr_stok_kalem_guncelleme_tarih
  before update on public.stok_kalemleri
  for each row
  execute function public.stok_kalem_guncelleme_tarih();

commit;

notify pgrst, 'reload schema';
