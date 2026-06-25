-- Zeyna AI asistani icin kullanici basina soru kotasi.
--
-- Mantik:
--   - Her personel kullanici default 3 soru hakkina sahip
--   - Her basarili Zeyna yanitindan sonra kalan -1
--   - 0'a inince edge function 'kota bitti' donerken Frontend uyari gosterir
--   - Admin Kullanicilar sayfasindan + butonuyla ekstra hak verebilir
--   - zeyna_toplam_soru lifetime sayim (istatistik icin, asla decrement edilmez)

alter table kullanicilar
  add column if not exists zeyna_kalan_soru integer not null default 3,
  add column if not exists zeyna_toplam_soru integer not null default 0;

notify pgrst, 'reload schema';
