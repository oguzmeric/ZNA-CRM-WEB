-- Servis raporu (form) icin servis_talepleri tablosuna ek kolonlar.
-- Personel servis talep detayinda 'Form Bilgileri' kartindan doldurur,
-- yazdirma cikti komponenti (ServisFormu) bu alanlari basar.
--
-- Idempotent — tekrar calistirilabilir.

alter table servis_talepleri
  add column if not exists servis_tipi      text,        -- virgül ayrılmış: 'ariza,bakim,kurulum'
  add column if not exists yukumluluk       text,        -- 'garanti' | 'servis' | 'bakim' | birden fazlasi virgülle
  add column if not exists servis_yeri      text,        -- 'teknik' | 'yerinde' | 'online' | 'diger'
  add column if not exists seri_numarasi    text,
  add column if not exists marka            text,
  add column if not exists model            text,
  add column if not exists kunye_numarasi   text,
  add column if not exists yedek_parcalar   jsonb default '[]'::jsonb;
  -- yedek_parcalar elementi: { aciklama: text, birim_fiyat: number, miktar: number, tutar: number }

-- PostgREST schema cache reload — frontend yeni kolonlari hemen gorebilsin
notify pgrst, 'reload schema';
