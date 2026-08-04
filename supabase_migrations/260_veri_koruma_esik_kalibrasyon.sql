-- 260 — Veri koruma eşikleri: gerçek kullanım verisiyle kalibrasyon (04.08)
--
-- SORUN: mig 259'da eşikler TAHMİNLE konmuştu (günlük 150.000 satır).
-- İlk günün gözetim verisi eşiğin çok düşük olduğunu gösterdi — sistemi
-- normal kullanan 5 kişiden 4'ü uyarı aldı (%80 yanlış pozitif):
--
--   Ferdi Kalkan     719 istek / 272.421 satır   (tek istek max 1000)
--   OĞUZ MERİÇ       839 istek / 231.838 satır   (tek istek max 1000)
--   Tarık Altaş      561 istek / 155.938 satır   (tek istek max 1000)
--   AHMET AGUN       486 istek / 153.604 satır   (tek istek max 1000)
--   ALİ UĞUR AKTEPE  366 istek / 117.516 satır   (tek istek max 1000)
--
-- ⭐ KRİTİK GÖZLEM: HERKESİN "tek istekte en çok" değeri tam 1000 —
-- yani pagedFetch'in SAYFA BOYU. Kimse anormal büyüklükte istek atmamış;
-- rakamlar tamamen sıradan liste yüklemelerinden birikmiş. En çok çekilen
-- tablolar da bunu doğruluyor: gorusmeler 408k, stok_urunler 183k,
-- musteriler 168k — hepsi sayfa açılışlarında yüklenen listeler.
--
-- Gözetim fazı kararı BU YÜZDEN doğruydu: otomatik askı açık olsaydı
-- bugün 5 aktif kullanıcıdan 4'ü kilitlenir, iş dururdu.
--
-- YENİ EŞİKLER — gözlenen normal tavanın belirgin katı:
--   günlük satır : 272k gözlendi → 1.000.000  (~3,7×)
--   günlük istek :  839 gözlendi →      5.000 (~6×)
--   tek istek    : 1000 normal   →      5.000 (sayfa boyunun 5 katı;
--                  bunu aşan istek pagedFetch dışı, elle kurulmuş demektir)

begin;

update public.veri_koruma_ayarlari
   set gunluk_satir_esigi = 1000000,
       gunluk_istek_esigi = 5000,
       tek_istek_esigi    = 5000,
       guncelleme         = now()
 where id = 1;

-- Bugünün yanlış uyarı bayraklarını sıfırla: yeni eşiklerle zaten
-- tetiklenmeyecekler, bayrak kalırsa gerçek bir aşımda uyarı ÇIKMAZ
-- (uyarildi=true olan satıra ikinci bildirim gönderilmiyor).
update public.veri_erisim_gunluk
   set uyarildi = false
 where gun = (now() at time zone 'Europe/Istanbul')::date
   and uyarildi = true;

select 'yeni esikler: satir=' || gunluk_satir_esigi || ' istek=' || gunluk_istek_esigi
    || ' tek=' || tek_istek_esigi || ' mod=' || mod as bilgi
from public.veri_koruma_ayarlari where id = 1
union all
select 'uyari bayragi sifirlanan: ' || count(*)::text
from public.veri_erisim_gunluk
where gun = (now() at time zone 'Europe/Istanbul')::date and uyarildi = false;

commit;
