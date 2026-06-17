-- Servis raporu (form ciktisi) icindeki YAPILAN ISLEMLER bolumu icin
-- servis_talepleri tablosuna cozum_aciklamasi kolonu ekle.
--
-- Form Bilgileri kartindan doldurulup ServisFormu.jsx'te basilir.
-- Idempotent — tekrar calistirilabilir.

alter table servis_talepleri
  add column if not exists cozum_aciklamasi text;

notify pgrst, 'reload schema';
