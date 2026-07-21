-- 213: Teknisyen + saha teknisyenlerine Mesai QR ve Araç Foto modülleri
-- (2026-07-21 talebi: "teknisyenlerin en çok kullanacağı modüller bunlar").
-- HomeScreen görünürlüğü kullanicilar.moduller (text[]) üzerinden:
--   mesai_takip → Mesai başlat/bitir QR kartı, arac_foto_takip → Araç Foto butonu.
-- Kişiler: Mahmut Sari 45, Mehmet Akif Erel 52, Sefa Ovungen 53, Alp Aslan 54,
-- Muhammet Emin Nayman 55, Ensar Kocyigit 56, huseyinanzerli69 57, Emin Erdem 58,
-- Omer Cadirci 60, Salih Çakmaklı 34. (Eski Ömer Çadırcı 41'de ikisi de zaten var.)

update kullanicilar
   set moduller = (
     select array_agg(distinct m)
       from unnest(coalesce(moduller, '{}') || array['mesai_takip', 'arac_foto_takip']) as m
   )
 where id in (34, 45, 52, 53, 54, 55, 56, 57, 58, 60);

select id, ad, moduller from kullanicilar
 where id in (34, 45, 52, 53, 54, 55, 56, 57, 58, 60) order by id;
