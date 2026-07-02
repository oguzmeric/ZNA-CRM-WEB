-- Görev SMS bildirim altyapısı:
--  1) kullanicilar.cep_telefon      : personel cep telefonu (SMS için)
--  2) gorevler.atama_sms_gonderildi : yeni görev atandığında SMS 1 kez atılsın
--  3) gorevler.gecikme_sms_gonderildi + tarihi : deadline aştıktan 24 saat sonra 1 kez SMS atılsın

alter table kullanicilar
  add column if not exists cep_telefon text;

alter table gorevler
  add column if not exists atama_sms_gonderildi   boolean default false,
  add column if not exists atama_sms_tarihi       timestamptz,
  add column if not exists gecikme_sms_gonderildi boolean default false,
  add column if not exists gecikme_sms_tarihi     timestamptz;

comment on column kullanicilar.cep_telefon is 'Personelin cep telefonu — SMS bildirimleri için (10 haneli 5xxxxxxxxx veya +90 5xxxxxxxxx).';
comment on column gorevler.atama_sms_gonderildi is 'Görev atandığında SMS gitti mi? (duplicate önlemek için).';
comment on column gorevler.gecikme_sms_gonderildi is 'Deadline aşımı 24 saat SMS gitti mi? (duplicate önlemek için).';

-- Schema cache reload
notify pgrst, 'reload schema';
