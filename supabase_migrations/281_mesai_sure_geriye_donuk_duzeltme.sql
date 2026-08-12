-- 281 — Mesai süresi, giriş/çıkış SONRADAN düzeltilince de yeniden hesaplansın
--
-- Sorun: `mesai_sure_hesapla_fn` süreyi YALNIZCA çıkış ilk kez yazıldığında
-- hesaplıyordu (`old.cikis_zamani is null` kapısı). Zaten kapanmış bir kaydın
-- giriş saati elle düzeltilince `sure_dakika` ESKİ değerinde kalıyor ve rapor
-- yanlış süre gösteriyordu — düzeltme sessizce yarım kalıyor.
--
-- Vaka (12.08.2026): Huseyin ANZERLI 11.08 akşamı fazla mesaiyi başlatmayı
-- unutmuş, 19:32'de başlatmış. Yönetici talebiyle giriş 19:00'a çekildi ama
-- süre 13 dk olarak kaldı (doğrusu 46 dk).
--
-- Çözüm: çıkış doluysa süre HER güncellemede yeniden hesaplanır. Hesap
-- formülü aynı (tam dakikaya aşağı yuvarlama) — yalnız kapı kaldırıldı.

create or replace function public.mesai_sure_hesapla_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  -- ⚠️ Kapı bilerek YOK: giriş veya çıkış sonradan düzeltilirse süre de düzelsin
  if new.cikis_zamani is not null then
    new.sure_dakika = extract(epoch from (new.cikis_zamani - new.giris_zamani))::int / 60;
  end if;
  return new;
end;
$$;

-- Hedefli onarım: yalnızca yukarıdaki vakanın kaydı.
-- (Trigger BEFORE UPDATE olduğu için bu UPDATE süreyi yeniden hesaplatır.)
--
-- ⚠️ TOPLU onarım BİLEREK YAPILMADI. Tarama 97 kapalı kaydın 5'inde sapma
-- buldu; dördü 03.08 tarihli ve yalnızca 1 dakika (526↔525 gibi) — o günkü
-- otomatik kapatmanın yuvarlamasından geliyor. Bordroya girmiş olabilecek
-- tarihsel sayıları 1 dakika için toplu değiştirmek doğru değil.
update public.mesai_kayitlari
set giris_zamani = giris_zamani
where id = '28384493-5161-4181-94e3-22225bb3c85f';
