-- 309 — Puantaj/maaş yetkisini ROL yerine MODÜL'e bağla.
--
-- SORUN (18.08 tespit): mig 303'te kapı `k.id = 44 or (k.rol = 'admin' and
-- k.tip = 'zna')` yazılmıştı. O gün admin = Ali + Oğuz idi, niyet de dosyanın
-- başında "yalnız Abdullah + admin" diye yazılıydı. Sonradan AHMET AGUN (29)
-- ve FERDİ KALKAN (33) admin yapıldı ve maaş kapısı KİMSE FARK ETMEDEN onlara
-- da açıldı. Sayfa kapısı (IKGuard/ikGorebilirMi) modül bakıyor, o yüzden
-- arayüzde görünmüyordu — ama REST katmanında personel_maaslari,
-- puantaj_duzeltmeler ve ik_puantaj_ayarlar onların oturumuna cevap veriyordu.
--
-- DERS: yetkiyi `rol = 'admin'` üzerine kurmak, rol dağıtımı değiştikçe
-- sessizce genişleyen bir kapı yaratır. Modül tabanlı yetki açıkça verilir.
--
-- KARAR (kullanıcı, 18.08): maaşı YALNIZ Ali Uğur Aktepe (1), Oğuz Meriç (2)
-- ve Abdullah İğde (44) görür. Bu üçü = 'ik_yonetim' modülü olanlar; web
-- tarafındaki ikGorebilirMi() ile birebir aynı küme (src/lib/ikYetki.js).
--
-- ⚠️ BUNDAN SONRA: birine 'ik_yonetim' modülü vermek MAAŞ ERİŞİMİ de verir.
-- Maaşı İK'dan ayırmak gerekirse ayrı bir bayrak (maas_yetkilisi) açılmalı.
--
-- Etkilenen politikalar (mig 303'te tanımlı, burada DEĞİŞMİYOR — hepsi bu
-- fonksiyonu çağırdığı için tek noktadan daralıyor):
--   personel_maaslari_ik / puantaj_duzeltmeler_ik / ik_puantaj_ayarlar_ik
-- Ayrıca puantaj_donem_ozeti() RPC'si de gövdesinde bu kapıyı kontrol ediyor.

begin;

create or replace function public.ik_puantaj_yetkili()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.kullanicilar k
     where k.auth_id = auth.uid()
       and coalesce(k.hesap_silindi, false) = false
       and coalesce(k.tip, '') = 'zna'          -- müşteri portal hesabı asla
       and 'ik_yonetim' = any(coalesce(k.moduller, '{}'))
  );
$$;

revoke all on function public.ik_puantaj_yetkili() from public, anon;
grant execute on function public.ik_puantaj_yetkili() to authenticated;

commit;
