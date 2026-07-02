-- Görevlere başlama tarihi ekle ve son_tarih'i saatli (timestamptz) hale getir.
-- Mevcut son_tarih string/date değerleri "23:59:59" olarak yorumlanır.

alter table gorevler
  add column if not exists baslama_tarih timestamptz;

-- son_tarih zaten text (frontend'den 'YYYY-MM-DD' geliyor) — timestamptz'e alter etmek riskli olabilir.
-- Onun yerine yeni bir kolon ekle: bitis_tarih_ts (timestamptz).
-- Uygulama yeni form saati de tutabilir, eski son_tarih legacy olarak durur.

alter table gorevler
  add column if not exists bitis_tarih timestamptz;

-- Var olan görevlerin son_tarih değerini bitis_tarih'e day-end (23:59) olarak taşı.
-- son_tarih'in tipini yakalayamıyorum ama 'YYYY-MM-DD' formatta ise cast eder.
update gorevler
set bitis_tarih = (son_tarih::text || ' 23:59:00')::timestamptz
where bitis_tarih is null and son_tarih is not null and son_tarih::text ~ '^\d{4}-\d{2}-\d{2}$';

comment on column gorevler.baslama_tarih is 'Görevin planlanan başlangıç tarihi/saati (opsiyonel).';
comment on column gorevler.bitis_tarih is 'Görevin bitiş tarihi/saati (son tarih, saat dahil).';

notify pgrst, 'reload schema';
