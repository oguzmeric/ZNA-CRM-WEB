-- Ön sipariş ve sipariş kalemlerine alış fiyatı kolonu ekle.
-- Sipariş Onayı ekranında kar oranı hesaplaması için kullanılır.
-- Sonradan kâr/marj raporlaması yapılabilsin diye DB'de kalıcı tutulur.

alter table on_siparis_kalemleri
  add column if not exists alis_fiyat numeric(14,4) not null default 0;

alter table siparis_kalemleri
  add column if not exists alis_fiyat numeric(14,4) not null default 0;

notify pgrst, 'reload schema';
