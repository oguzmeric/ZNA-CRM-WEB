-- 246 — YETKİ YÜKSELTME AÇIĞI KAPATILIYOR (KRİTİK)
--
-- BULGU (kanıtlandı, 30.07): personel kendini admin yapabiliyordu.
--   * `kullanicilar_self_update` politikası `auth_id = auth.uid()` diyor ama
--     HANGİ KOLONU değiştirdiğine bakmıyor. Koruyucu trigger da yoktu.
--   * `is_admin()` ünvan METNİNE bakıyordu ('genel müdür', 'teknik müdür',
--     'genel müdür yardımcısı', 'yazılım geliştirmeci').
--   * Mobil ProfilScreen.js:94 personelin KENDİ ünvanını serbest metin olarak
--     yazmasına izin veriyor — yani açık için Postman bile gerekmiyordu,
--     profil ekranından "Genel Müdür" yazmak yeterliydi.
--   Rollback'li kanıt (Salih Çakmaklı, id 34, rol=personel):
--     is_admin() f -> t, rol='admin', ad='Ali', moduller+teklifler — hepsi yazıldı.
--
-- ÇÖZÜM İKİ PARÇALI:
--  1) is_admin() artık serbest yazılan ünvana değil, `rol` + `tip` kolonlarına
--     bakıyor. Bu kolonlar (2)'deki trigger ile kilitlendiği için personel
--     kendini yükseltemez.
--  2) BEFORE UPDATE trigger: admin değilsen yetki/kimlik kolonları OLD=NEW.
--     Ünvan BİLEREK serbest bırakıldı — artık yetki taşımıyor, dolayısıyla
--     profil ekranındaki meşru "ünvanımı düzelt" özelliği çalışmaya devam eder.
--
-- DAVRANIŞ DEĞİŞMİYOR: ünvan listesinden geçen 4 kişi ile rol='admin' olan 4
-- kişi BİREBİR AYNI (id 1 Ali Uğur Aktepe, 2 Oğuz Meriç, 29 Ahmet Agun,
-- 33 Ferdi Kalkan — hepsi tip='zna'). Yani kimsenin yetkisi değişmiyor,
-- yalnızca yetkinin OKUNDUĞU yer güvenli hale geliyor.
--
-- NOT: `is_staff()` bulgusu (müşteri portal hesaplarının personel yetkisinde
-- olması) BU MIGRATION'IN KAPSAMINDA DEĞİL — 4 hesabın erişimini kestiği için
-- ayrı onay bekliyor.

begin;

-- ── 1) is_admin(): ünvan metni yerine rol + tip ────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from kullanicilar
     where auth_id = auth.uid()
       and rol = 'admin'
       and coalesce(tip, '') = 'zna'          -- müşteri portal hesabı admin olamaz
       and coalesce(hesap_silindi, false) = false
  );
$$;

-- ── 2) Yetki/kimlik kolonlarını kilitle ────────────────────────────────────
create or replace function public.kullanicilar_yetki_koruma()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Arka plan işlemleri (service_role edge fonksiyonları, pg_cron, migration)
  -- JWT taşımaz → auth.uid() null. Bunları ENGELLEMEK bildirim/senkron
  -- zincirlerini kırar; RLS'i zaten bypass eden güvenilir yollar.
  if auth.uid() is null then
    return new;
  end if;

  -- Yönetici her alanı değiştirebilir (kullanıcı yönetimi ekranı)
  if (select public.is_admin()) then
    return new;
  end if;

  -- Buradan aşağısı: personel kendi satırını güncelliyor.
  -- SERBEST kalanlar (bilinçli): unvan, durum, foto_url, imza, cep_telefon,
  -- email/email_dogrulandi, ehliyet_*, zeyna_*, hesap_silindi (KVKK: kendi
  -- hesabını silme akışı), silinme_tarihi.
  if new.rol                      is distinct from old.rol
     or new.tip                   is distinct from old.tip
     or new.moduller              is distinct from old.moduller
     or new.ad                    is distinct from old.ad
     or new.auth_id               is distinct from old.auth_id
     or new.musteri_id            is distinct from old.musteri_id
     or new.kullanici_adi         is distinct from old.kullanici_adi
     or new.silinebilir           is distinct from old.silinebilir
     or new.izinli_turler         is distinct from old.izinli_turler
     or new.onay_durum            is distinct from old.onay_durum
     or new.onaylayan_id          is distinct from old.onaylayan_id
     or new.siparis_onay_yetkilisi   is distinct from old.siparis_onay_yetkilisi
     or new.siparis_onay_ust_yetkili is distinct from old.siparis_onay_ust_yetkili
     or new.teklif_onay_yetkilisi    is distinct from old.teklif_onay_yetkilisi
     or new.teklif_onay_ust_yetkili  is distinct from old.teklif_onay_ust_yetkili
     or new.fatura_yetkilisi      is distinct from old.fatura_yetkilisi
     or new.montaj_sorumlusu      is distinct from old.montaj_sorumlusu
     or new.gorev_yetki           is distinct from old.gorev_yetki
     or new.demirbas_yetkilisi    is distinct from old.demirbas_yetkilisi
     or new.saha_sorumlusu        is distinct from old.saha_sorumlusu
  then
    raise exception 'Yetki alanlarini yalnizca yonetici degistirebilir (rol/tip/moduller/ad/onay yetkileri).';
  end if;

  return new;
end $$;

alter function public.kullanicilar_yetki_koruma() owner to postgres;

drop trigger if exists tr_kullanicilar_yetki_koruma on public.kullanicilar;
create trigger tr_kullanicilar_yetki_koruma
  before update on public.kullanicilar
  for each row execute function public.kullanicilar_yetki_koruma();

commit;
