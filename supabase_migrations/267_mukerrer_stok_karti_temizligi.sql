-- 267 — Mükerrer stok kartı temizliği (A+B grubu)
-- Uygulandı: 2026-08-04. Bu dosya YAPILAN İŞİN KAYDIDIR; id listesi o günün
-- verisine göre sabittir, başka bir ortamda yeniden çalıştırılmamalıdır.
--
-- Sorun: 2599 aktif karttan 49'u (24 grup) bir başkasıyla BİREBİR aynı ada
-- sahipti. Ürün adı ZNA'da üretici model kodudur (stok_kodu = STK iç sayaç),
-- bu yüzden kopya adlar teklifte "Excel'den Toplu Satır Ekle" eşleştirmesini
-- belirsiz bırakıyor ve aynı ürün iki karta bölünüyordu.
--
-- Neden SİLME değil PASİFE ÇEKME:
--   * Referanslar FK ile değil METİN stok_kodu ile kurulu (tek FK:
--     stok_urun_ozellikler.urun_id) — silmek yetim satır bırakırdı.
--   * Teklif satırları ürün adını ve fiyatını KENDİ İÇİNDE tutuyor
--     (10.931 satırın 10.930'unda stokAdi gömülü), bu yüzden pasife çekmek
--     hiçbir eski teklifi, çıktıyı veya geçmişi bozmuyor.
--   * aktif=false olan kart arayüzde "Pasifleri göster" ile görünür ve tek
--     tıkla geri alınır.
--
-- Kapsam: yalnız referansı HİÇ OLMAYAN kopyalar (A grubu: tek kart kullanılmış,
-- B grubu: grubun tamamı ölü). Her iki kartın da geçmişi olan 11 grup (C)
-- bilinçli olarak DIŞARIDA bırakıldı — onlarda hangi kartın kalacağı iş kararı.
--
-- Sonuç: 14 kart pasife çekildi, mükerrer grup 24 → 11.

begin;

-- Güvenlik kilidi: bu kartlardan biri arada kullanıldıysa işlemi durdur
do $$
declare n int;
begin
  select count(*) into n from (
    select stok_kodu from stok_hareketleri
    union all select stok_kodu from malzeme_hareketleri
    union all select stok_kodu from servis_malzemeleri
    union all select stok_kodu from servis_malzeme_plani
    union all select stok_kodu from siparis_kalemleri
    union all select stok_kodu from on_siparis_kalemleri
    union all select stok_kodu from kesif_kalemleri
    union all select stok_kodu from satis_satirlari
    union all select stok_kodu from stok_kalemleri
    union all select stok_kodu from bagimsiz_snler
    union all select stok_kodu from stok_opsiyonlar
    union all select stok_kodu from esn_teklif_kalemleri
    union all select s->>'stokKodu' from teklifler t,
             lateral jsonb_array_elements(coalesce(t.satirlar,'[]'::jsonb)) s
    union all select s->>'stokKodu' from teklif_sablonlari t,
             lateral jsonb_array_elements(coalesce(t.satirlar,'[]'::jsonb)) s
  ) r
  join stok_urunler u on u.stok_kodu = r.stok_kodu
  where u.stok_kodu in (
    'STK00560','STK00858','STK03275','STK01759','STK00230','STK01869','STK03451',
    'STK01094','STK00041','STK02655','STK02905','STK02906','STK02907','STK01646'
  );
  if n > 0 then
    raise exception 'İPTAL: pasife alınacak kartlarda % referans bulundu', n;
  end if;
end $$;

update stok_urunler
set aktif = false
where stok_kodu in (
  -- pasife çekilen        kalan kart (referans sayısı)
  'STK00560',  -- STK00561 (1)   "DS-D5019QE-B
  'STK00858',  -- STK00798 (10)  FO KABLO SM 12 CORE 9/125µ ÇELİK ZIRHLI
  'STK03275',  -- STK01311 (5)   FO PATCH CORD DUPLEX LC/LC SM 9/125µ 3MT
  'STK01759',  -- STK01781 (1)   HY-LED1016 16 Bölge LED Tuş Takımı
  'STK00230',  -- STK00229 (1)   IPH206 KAREL
  'STK01869',  -- STK01867 (1)   LOGITECH M170 Kablosuz Mouse
  'STK03451',  -- STK03450 (1)   Neuro Fire and Smoke Detector INT
  'STK01094',  -- STK01047 (1)   Next-Gen Wireless Controller
  'STK00041',  -- STK00029 (0)   NSE-382RZ-36 KAREL  (grubun tamamı ölü)
  'STK02655',  -- STK02650 (1)   SC-LC SM DX FIBER PATCH CORD 3MT
  'STK02905',  -- STK02911 (1)   TR-D6254IR15 v3 5-115
  'STK02906',  -- STK02911 (1)   TR-D6254IR15 v3 5-115
  'STK02907',  -- STK02647 (2)   TR-NS1110-105-8POE v2
  'STK01646'   -- STK01632 (7)   TSF 02 TEKNİKSAT 1/2 UYDU BÖLÜCÜ
);

commit;

-- GERİ ALMA (gerekirse):
-- update stok_urunler set aktif = true where stok_kodu in (
--   'STK00560','STK00858','STK03275','STK01759','STK00230','STK01869','STK03451',
--   'STK01094','STK00041','STK02655','STK02905','STK02906','STK02907','STK01646');
