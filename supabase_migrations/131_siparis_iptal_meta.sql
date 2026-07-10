-- Siparişte iptal metadatası: kim iptal etti + ne zaman.
alter table siparisler
  add column if not exists iptal_eden_ad text,
  add column if not exists iptal_tarih timestamptz;

notify pgrst, 'reload schema';
