-- 237 — Mesai kayıtlarını İK yetkilileri de okuyabilsin.
--
-- Sorun: mesai_kendi_okur politikası yalnız (kendi kaydı | admin | adı
-- Oğuz/Ali/Ferdi olan) kişilere okuma veriyordu. Abdullah İğde rol='personel'
-- ve isim eşleşmesi yok → İK Yönetim'deki mesai raporu onda BOŞ çıkardı.
--
-- Çözüm: ik_yetkili() (mig 205 — 'ik_yonetim' modüllüler: Ali, Oğuz, Abdullah)
-- koşulu EKLENİR. Mevcut koşullar aynen korunur (Ferdi isim kuralıyla görmeye
-- devam eder). Yazma politikaları DEĞİŞMEZ — bu yalnız okuma.
--
-- Not: ik_yetkili() çağrısı (select ...) içinde — RLS initplan performans kuralı.

drop policy if exists mesai_kendi_okur on public.mesai_kayitlari;

create policy mesai_kendi_okur on public.mesai_kayitlari
for select using (
  exists (
    select 1 from public.kullanicilar k
    where k.auth_id = auth.uid()
      and (
        k.id = mesai_kayitlari.kullanici_id
        or k.rol = 'admin'
        or k.ad ~* '\m(oğuz|oguz|ali|ferdi)\M'
      )
  )
  or (select public.ik_yetkili())
);

comment on policy mesai_kendi_okur on public.mesai_kayitlari is
  'Kendi kaydı + admin + (Oğuz/Ali/Ferdi) + İK yetkilileri (ik_yonetim modülü) okuyabilir.';
