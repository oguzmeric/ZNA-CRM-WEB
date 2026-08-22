-- 323 — YETKİ ARKA KAPISI KAPATMA (22.08 yetki denetimi, Faz 1)
--
-- 🔴 AÇIK: Personel kendini yönetici yapıp herkesin şifresini değiştirebiliyordu.
--   1) kullanicilar UPDATE politikası kişinin kendi satırını yazmasına izin verir
--   2) kullanicilar_yetki_koruma trigger'ı rol/tip/moduller/onay yetkilerini kilitler
--      ama UNVAN korunan alanlar listesinde YOKTU
--   3) mobil Profil ekranından kullanıcı kendi unvanını serbestçe yazabiliyordu
--   4) admin_sifre_sifirla RPC'si (authenticated'a açık) yetkiyi UNVAN METNİNDEN okuyordu
--   => teknisyen unvanını 'Genel Müdür' yapıp herhangi bir hesabın şifresini değiştirebilirdi.
--
-- ÇÖZÜM: unvan artık yetki taşımaz (salt İK etiketi). Yetki kriteri TEK: is_admin()
-- (rol='admin' AND tip='zna' AND hesap_silindi=false — mig 246).
--
-- KİMSE YETKİ KAYBETMEZ — uygulama öncesi canlı ölçüm:
--   unvan listesinden geçen ama rol<>'admin' olan kişi sayısı = 0
--   admin: 1 ALİ UĞUR AKTEPE, 2 OĞUZ MERİÇ, 29 AHMET AGUN, 33 Ferdi Kalkan
--   (dördü de zaten unvan listesindeydi → davranış aynı, arka kapı kapanır)

-- ── 1) Şifre sıfırlama RPC'si: unvan metni yerine is_admin() ──────────────────
-- İmza ve ad DEĞİŞMEZ; çağıran istemciler (mobil AdminPersonelDetay) etkilenmez.
create or replace function public.admin_sifre_sifirla(hedef_id bigint, yeni_sifre text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  hedef_auth uuid;
  hedef_rol  text;
begin
  -- Yetki: yalnız gerçek yönetici (rol='admin' AND tip='zna'). Unvan ARTIK GEÇERSİZ.
  if not (select public.is_admin()) then
    raise exception 'Yetkisiz: yalnızca yöneticiler şifre sıfırlayabilir.';
  end if;

  if length(yeni_sifre) < 6 then
    raise exception 'Şifre en az 6 karakter olmalı.';
  end if;

  select auth_id, rol into hedef_auth, hedef_rol
  from kullanicilar
  where id = hedef_id;

  if hedef_auth is null then
    raise exception 'Kullanıcı bulunamadı veya auth bağlantısı yok.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(yeni_sifre, extensions.gen_salt('bf')),
      updated_at = now()
  where id = hedef_auth;

  begin
    update kullanicilar set sifre = yeni_sifre where id = hedef_id;
  exception
    when undefined_column then null;
  end;
end;
$function$;

-- ── 2) unvan korunan alanlara eklenir ────────────────────────────────────────
-- Artık kişi KENDİ unvanını değiştiremez; yalnız yönetici atar (İK etiketi).
create or replace function public.kullanicilar_yetki_koruma()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (select public.is_admin()) then
    return new;
  end if;

  if new.rol                      is distinct from old.rol
     or new.tip                   is distinct from old.tip
     or new.moduller              is distinct from old.moduller
     or new.ad                    is distinct from old.ad
     -- 22.08: unvan YETKİ TAŞIYORDU (mobil yönetim paneli + eski şifre RPC'si).
     -- Yetki bağı kesildi ama unvan yine İK verisidir: kişi kendi unvanını yazamaz.
     or new.unvan                 is distinct from old.unvan
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
     -- mig 259: askı alanları — kişi kendi askısını kaldıramaz
     or new.askida                is distinct from old.askida
     or new.aski_sebebi           is distinct from old.aski_sebebi
     or new.aski_tarihi           is distinct from old.aski_tarihi
  then
    raise exception 'Yetki alanlarini yalnizca yonetici degistirebilir (rol/tip/moduller/ad/unvan/onay yetkileri).';
  end if;

  return new;
end $function$;

comment on function public.admin_sifre_sifirla(bigint, text) is
  '22.08: yetki kriteri unvan metni DEĞİL is_admin() (mig 323 — yetki yükseltme arka kapısı kapatıldı).';
