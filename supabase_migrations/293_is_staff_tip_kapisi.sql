-- 293 — is_staff() müşteri portal hesaplarını PERSONEL sayıyordu (KRİTİK)
--
-- BULGU (24.07 taramasında tespit, 15.08'de yeniden ölçülüp KAPATILDI):
-- `is_staff()` yalnız `rol in ('admin','personel')` bakıyor, `tip` kolonuna
-- BAKMIYORDU. tip='musteri' olan 5 hesabın rol'ü yanlışlıkla 'personel'.
--
-- CANLI ÖLÇÜM — dış firma hesabı (id 61, GÖKHAN EKER / @basakkent.com.tr,
-- BAŞAKKENT İNŞAAT A.Ş.) kendi JWT'siyle şunları okuyabiliyordu:
--     is_staff() = true
--     2022 müşteri · 3603 görüşme · 3996 stok kalemi · 248 görev · 163 servis
-- Portal arayüzü kısıtlasa da REST API'ye doğrudan istek atan biri hepsini çeker.
--
-- ETKİ ANALİZİ (fix'ten önce ölçüldü — bu yüzden risk yok):
--   tip='zna'     : 4 admin + 19 personel = 23 kişi — HEPSİNİN modülü var,
--                   14'ünün mesai kaydı, 12'sinin görevi var → GERÇEK ÇALIŞANLAR
--   tip='musteri' : 5 hesap — hiçbirinin modülü, mesaisi, görevi YOK
--                   (18 Gökhan Eker, 32 ZNA TEST, 51 ali göktepe,
--                    61 GÖKHAN EKER/Başakkent, 64 gurbetciftci3449)
-- => Kapı yalnız bu 5 hesabı etkiler, tek bir çalışanı bile etkilemez.
--
-- ⚠️ MÜŞTERİ PORTALI KIRILMAZ: portal politikaları `current_musteri_id()`
-- üzerinden çalışıyor, is_staff()'tan BAĞIMSIZ. Örnek (servis_talepleri):
--     servis_talepleri_customer_select : musteri_id = current_musteri_id()
--     servis_talepleri_staff_all       : is_staff()
-- Portal hesabı kendi firmasının taleplerini görmeye DEVAM EDER; yalnız
-- personel verisine erişimi kesilir. İstenen davranış tam olarak budur.
--
-- ⚠️ Gurbet Çiftçi'nin GERÇEK hesabı id 63 (@zna.local, tip='zna', modüllü);
-- id 64 (@gmail.com) ayrı ve işlevsiz bir kayıt — kesinti yaşamaz.
--
-- NOT: Bu migration hesapların rol/tip değerlerine DOKUNMAZ, yalnız kapıyı
-- düzeltir. Hesap temizliği (silme/rol düzeltme) ayrı bir karar.

begin;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select rol in ('admin','personel')
        and coalesce(tip, '') = 'zna'            -- ⚠️ mig 293: portal hesabı personel sayılmaz
        and coalesce(hesap_silindi, false) = false
        and (rol = 'admin' or coalesce(askida, false) = false)
     from kullanicilar where auth_id = auth.uid()),
    false
  );
$$;

-- ── arac_iz_durumu: RLS açık ama HİÇ POLİTİKASI YOKTU ───────────────────────
-- Tabloyu mobiltek-rota-kaydet edge fn'i service_role ile yazıyor (14 satır,
-- son güncelleme 09.08 — yani veri AKIYOR), ama `src/services/rotaService.js`
-- istemciden okumaya çalışıyor ve politika olmadığı için HİÇBİR ŞEY dönmüyor.
-- Sessiz işlevsellik kaybı: araç iz durumu ekranda boş görünüyor.
drop policy if exists arac_iz_durumu_staff_select on public.arac_iz_durumu;
create policy arac_iz_durumu_staff_select on public.arac_iz_durumu
  for select using ((select is_staff()));

commit;
