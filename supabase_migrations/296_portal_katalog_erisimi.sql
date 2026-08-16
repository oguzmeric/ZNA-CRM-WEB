-- 296 — Portal kataloğu müşteriye kapanmıştı (mig 293'ün yan etkisi) + kategori ağacı
--
-- REGRESYON: mig 293 `is_staff()`'a `tip='zna'` kapısı ekledi. `stok_urunler`
-- politikası (`stok_urunler_staff_all` → is_staff()) ve `stok_kategoriler`
-- (`stok_kategori_sel` → is_staff()) bu fonksiyona dayandığı için portal
-- müşterisi katalogda HİÇBİR ÜRÜN göremez oldu.
--
-- CANLI ÖLÇÜM (ZNA TEST id 32, auth 8aad456d-…, rollback'li test):
--   is_staff() = false · stok_urunler görünen satır = 0 · stok_kategoriler = 0
-- Kullanıcının portal ekran görüntüsünde "Katalogda ürün bulunamadı" yazıyordu.
--
-- ⚠️ NEDEN TABLOYA DOĞRUDAN POLİTİKA VERİLMİYOR:
-- `stok_urunler` maliyet ve satış fiyatı taşıyor (alis_fiyat, birim_fiyat,
-- tedarikci, tedarikci_urun_kodu, raf, stok_miktari). RLS satır bazlıdır;
-- müşteriye satırı açarsak istemci kendi sorgusuyla BU KOLONLARI DA çeker →
-- maliyet ve tedarikçi sızıntısı. Bu yüzden yalnız güvenli kolonları taşıyan
-- bir VIEW açılıyor.
--
-- Görünüm `security_invoker = off` (varsayılan) ile çalışır: sahibinin
-- haklarıyla okur, tablonun RLS'i devreye girmez. Erişim GRANT ile sınırlanır.

begin;

-- ── Portal kataloğu: yalnız müşteriye gösterilebilir kolonlar ──────────────
create or replace view public.portal_katalog as
  select id, stok_kodu, stok_adi, marka, grup_kodu, kategori_id,
         birim, aciklama, gorsel_url, dokuman_url, dokuman_ad
    from public.stok_urunler
   where katalogda_goster = true
     and aktif = true;

comment on view public.portal_katalog is
  'Müşteri portalı ürün kataloğu. FİYAT/MALİYET/TEDARİKÇİ/STOK KOLONU YOKTUR — '
  'yeni kolon eklerken bu kural korunmalı (mig 296).';

revoke all on public.portal_katalog from public, anon;
grant select on public.portal_katalog to authenticated;

-- ── Kategori ağacı: portal filtre panelinin kaynağı ───────────────────────
-- Kategori adı ve hiyerarşi hassas veri değil; ürün sayıları zaten katalogtan
-- hesaplanıyor. Yazma hakkı yine yalnız admin (mevcut ins/upd/del politikaları).
create policy stok_kategori_portal_sel on public.stok_kategoriler
  for select
  using (
    (select is_staff())
    or exists (
      select 1 from public.kullanicilar k
       where k.auth_id = auth.uid()
         and coalesce(k.tip, '') = 'musteri'
         and coalesce(k.hesap_silindi, false) = false
         and coalesce(k.askida, false) = false
    )
  );

commit;
