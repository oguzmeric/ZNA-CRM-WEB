-- Gorevler RLS: personel policy'sinde olusturan_ad / atanan_ad karşılaştırmalarını
-- kullanicilar.ad VE kullanicilar.kullanici_adi (her ikisi) ile eşleştir.
--
-- Sebep: Mobile uygulama eskiden olusturan_ad olarak kullanici_adi ("hasan") yollamış,
-- yeni sürüm ad ("Hasan Yılmaz") yolluyor. AsyncStorage cache'lenmiş eski profil
-- taşıyan kullanıcılar hâlâ eski değer gönderiyor. Her iki değeri de kabul ediyoruz —
-- güvenlik açısından fark yok: her iki kolon da kullanıcıyı tekil olarak tanımlar.

drop policy if exists "gorevler_personel_self" on gorevler;

create policy "gorevler_personel_self" on gorevler
  for all
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan   = (select id::text from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      -- Yeni: çoklu atama (ekip) ile göreve dahil edilen kullanıcılar da görsün
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  )
  with check (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan   = (select id::text from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      -- INSERT sırasında ekip kolonuna kendini de koyabilir (yeni oluşturulan görev)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  );

notify pgrst, 'reload schema';
