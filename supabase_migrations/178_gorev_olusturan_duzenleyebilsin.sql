-- 178 — Görevi OLUŞTURAN da düzenleyebilsin
--
-- İSTEK: "Hasan telefondan Ahmet Agun'a görev açıyor ama kendi açtığı görevi
-- düzenleyemiyor."
--
-- KÖK NEDEN: gorevler_personel_update politikası yalnız atanan_id VEYA ekip
-- üyesine UPDATE izni veriyordu; olusturan_ad kontrolü UPDATE'te YOKtu
-- (INSERT politikasında vardı). Başkasına atanan bir görevi oluşturan kişi
-- (atanan değil, ekipte de değil) RLS'e takılıp "Görev güncellenemedi" alıyordu.
--
-- ÇÖZÜM: UPDATE USING + WITH CHECK'e INSERT'teki olusturan_ad eşleşmelerini ekle.
-- (Skor/performans bütünlüğü korunur — atama ve tamamlama davranışı değişmez,
--  sadece görevi AÇAN kişi kendi kaydını düzenleyebilir hâle gelir.)

begin;

drop policy if exists gorevler_personel_update on gorevler;

create policy gorevler_personel_update on gorevler
  for update
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
    )
  )
  with check (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
    )
  );

commit;
