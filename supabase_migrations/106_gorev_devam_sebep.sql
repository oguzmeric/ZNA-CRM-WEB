-- 106: Görev "Devam Ediyor" durumu için opsiyonel devam sebep kolonu
-- Değerler: hava_muhalefeti, program_yogunlugu, tamir_ariza, uretici_tedarik
-- NULL = sebep belirtilmemiş (durum devam ediyor ama neden özellikle belirtilmedi)

alter table public.gorevler
  add column if not exists devam_sebep text;

comment on column public.gorevler.devam_sebep is
  'Görev "devam" durumundayken opsiyonel sebep: hava_muhalefeti | program_yogunlugu | tamir_ariza | uretici_tedarik';

notify pgrst, 'reload schema';
