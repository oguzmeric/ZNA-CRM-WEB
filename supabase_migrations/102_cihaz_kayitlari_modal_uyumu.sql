-- 102: cihaz_kayitlari — mobile CihazTeknikBilgiModal alanları ile uyumlaştır
-- Mevcut modal alanları: ipAdresi, macAdresi, cihazKullanici, cihazSifre,
--                        nvrBilgisi, kanalNo, altLokasyon
-- Modal zorunlu kılmıyor (sadece IP ve alt-lokasyon önerilir).
--
-- 101 aşırı katıydı: MAC/kullanıcı/şifre NOT NULL idi, snapshot akışına uymuyor.
-- Bu migration onları NULLABLE yapar + eksik kolonları ekler.

-- 1) NOT NULL kısıtlarını gevşet
alter table public.cihaz_kayitlari
  alter column ip_adresi drop not null,
  alter column mac_adresi drop not null,
  alter column kullanici_adi drop not null,
  alter column sifre drop not null;

-- 2) Modal'da olan ek alanları ekle
alter table public.cihaz_kayitlari
  add column if not exists nvr_bilgisi text,
  add column if not exists kanal_no integer,
  add column if not exists alt_lokasyon text;

notify pgrst, 'reload schema';
