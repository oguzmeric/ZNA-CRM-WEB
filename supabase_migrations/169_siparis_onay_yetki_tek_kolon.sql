-- Sipariş onayında BİRBİRİNE ÇOK BENZEYEN İKİ KOLON vardı:
--
--   siparis_onay_yetkilisi  (mig 050)  → UI yetkisi: App.jsx SiparisOnayGuard,
--                                        MainLayout menü filtresi, SiparisOnaylari sayfası
--   siparis_onay_yetkili    (mig 132)  → SADECE bildirim/SMS alıcısı
--                                        (onSiparisService.onSiparisOnayaBildir)
--
-- İki bağımsız liste: "onay bildirimi geliyor ama sayfaya giremiyorum" (ya da
-- tersi) sessizce ortaya çıkabilirdi. Değerleri şu an şans eseri aynı (Ali,
-- Oğuz, Ahmet) — yani bugün kırık bir şey yok; birini güncelleyip diğerini
-- unutmak an meselesiydi. İsimler bir harf farkıyla ayrıldığı için gözden
-- kaçması da çok kolaydı.
--
-- Karar: TEK KAYNAK = siparis_onay_yetkilisi. Bildirim de aynı bayrağa bakar
-- (onSiparisService güncellendi), fazlalık kolon kalkar.

-- 1) Güvenlik: kolonlar arasında kayma varsa kanonik olana taşı (kimse yetkisiz
--    kalmasın). Şu an fark yok — no-op; ileride farklı bir ortamda çalışırsa diye.
update kullanicilar
   set siparis_onay_yetkilisi = true
 where siparis_onay_yetkili is true
   and siparis_onay_yetkilisi is not true;

-- 2) Fazlalık kolonu kaldır. Tek kullanıcısı onSiparisService'ti; artık
--    siparis_onay_yetkilisi okuyor. Mobil, edge fn ve RLS'te hiç geçmiyor.
alter table kullanicilar drop column if exists siparis_onay_yetkili;

comment on column kullanicilar.siparis_onay_yetkilisi is
  'Sipariş Onayı TEK yetki kaynağı: sayfa erişimi (App.jsx guard + sidebar) ve ön sipariş bildirim/SMS alıcısı. Ayrı bir bildirim bayrağı YOK — mig 169 ile birleştirildi.';

notify pgrst, 'reload schema';
