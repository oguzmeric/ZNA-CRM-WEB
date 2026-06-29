-- Servis talebi kaynagi: musteri portalindan mi yoksa personel mi olusturdu?
-- Sidebar'da 'Musteri Talepleri' alt-menusu icin filtre kolonu.
--
-- Default 'personel' — yeni kayitlar musteri portal'dan geliyorsa client
-- 'musteri' olarak set eder (ServisTalebiContext.talepOlustur).
-- Eski kayitlar default 'personel' kalir (gecmis ayirt edilemiyor).

alter table servis_talepleri
  add column if not exists kaynak text default 'personel'
    check (kaynak in ('personel', 'musteri'));

create index if not exists idx_servis_talep_kaynak
  on servis_talepleri(kaynak) where kaynak = 'musteri';

notify pgrst, 'reload schema';
