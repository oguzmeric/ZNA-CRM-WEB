-- Migration 052: Personel (servis personeli) imzası
-- Personel profil ayarlarından kendi imzasını bir kere ekler (kullanicilar.imza).
-- Servis formu kapatıldığında, formu kapatan kişinin imzası talebe snapshot
-- olarak yazılır (servis_talepleri.personel_imza + personel_imza_ad) — böylece
-- sonradan kim önizlerse önizlesin formda doğru imza/ad görünür.
-- İmzalar base64 PNG data-URI olarak saklanır (müşteri imzası ile aynı yöntem).

alter table kullanicilar add column if not exists imza text;

alter table servis_talepleri add column if not exists personel_imza text;
alter table servis_talepleri add column if not exists personel_imza_ad text;

notify pgrst, 'reload schema';
