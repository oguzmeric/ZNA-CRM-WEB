-- 256 — Negatif stok bakiyelerini kapat
--
-- Durum: 5 SN'siz üründe bakiye eksideydi (toplam −204). Hepsinde ÇIKIŞ var,
-- GİRİŞ yok: mal fiilen çıkmış (satış faturası / servise teslim kayıtları
-- duruyor) ama depoya girişi sisteme hiç işlenmemiş.
--
-- Yöntem: geçmiş hareketlere DOKUNULMUYOR — eksiği kapatan bir "düzeltme
-- girişi" hareketi ekleniyor. Böylece hem bakiye 0'a geliyor hem de neyin
-- ne zaman düzeltildiği hareket geçmişinde iz bırakıyor (silme/üzerine yazma
-- yapılsaydı satışın kaydı da kaybolurdu).
--
-- Kapsam DIŞI bırakılanlar:
--   • Seri takipli ürünler (STK00571 vb.): ekran bakiyeyi kalem sayısından
--     hesaplıyor, zaten 0 gösteriyor. Hareket neti eksi ama bu SN silinmesinden
--     kalan artık; düzeltme girişi yapılırsa ürün kartı ŞİŞER.
--   • STK03765: ürün kartı yok, stok listesinde görünmüyor.

do $$
declare
  r record;
  v_eksik numeric;
begin
  for r in
    select u.stok_kodu, u.stok_adi,
           coalesce(sum(case when h.hareket_tipi in ('giris','transfer_giris') then h.miktar
                             when h.hareket_tipi in ('cikis','transfer_cikis') then -h.miktar
                             else 0 end), 0) as bakiye
    from stok_urunler u
    join stok_hareketleri h on h.stok_kodu = u.stok_kodu
    where u.seri_takipli is not true
    group by u.stok_kodu, u.stok_adi
    having coalesce(sum(case when h.hareket_tipi in ('giris','transfer_giris') then h.miktar
                             when h.hareket_tipi in ('cikis','transfer_cikis') then -h.miktar
                             else 0 end), 0) < 0
  loop
    v_eksik := -r.bakiye;
    insert into stok_hareketleri
      (stok_kodu, stok_adi, hareket_tipi, miktar,
       onceki_miktar, sonraki_miktar, aciklama, kullanici_ad, tarih)
    values
      (r.stok_kodu, r.stok_adi, 'giris', v_eksik,
       r.bakiye, 0,
       'Düzeltme girişi — sisteme işlenmemiş giriş (negatif bakiye kapatma). '
         || 'Çıkış kayıtları duruyor; depo doğrulaması gerekir.',
       'Sistem', now());
    raise notice 'Duzeltildi: % (%) -> +%', r.stok_kodu, r.bakiye, v_eksik;
  end loop;
end $$;

-- Ürün kartındaki miktar da eksideyse 0'a çek (ekranda ayrı yerde görünüyor)
update public.stok_urunler
   set stok_miktari = 0
 where stok_miktari < 0;
