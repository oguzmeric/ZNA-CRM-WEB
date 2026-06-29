-- Musteri kendi talebini silebilsin — sadece 'bekliyor' veya 'iptal' durumunda.
-- Personel ise zaten staff_all policy'si ile her zaman silebiliyor.
-- Iceride is yapilmis (devam_ediyor/tamamlandi) talepler kayit gecmisi acisindan
-- musteri tarafindan silinemesin.

create policy "servis_talepleri_customer_delete"
  on servis_talepleri
  for delete
  using (
    musteri_id = current_musteri_id()
    and durum in ('bekliyor', 'iptal')
  );

notify pgrst, 'reload schema';
