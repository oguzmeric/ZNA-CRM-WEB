-- 298 — Müşteri portalı "Cihazlarım": SN'li cihaz envanteri + lokasyon + durum
--
-- İSTEK: müşteri kendi cihazlarını, seri numaralarını, lokasyonlarını ve
-- arızalı/tamirdeki ürünlerini görebilsin.
--
-- ⚠️ KAYNAK SEÇİMİ — cihaz bilgisi ÜÇ tabloda ve senkronsuz:
--     musteri_cihazlari   13 satır /  8 müşteri
--     cihaz_kayitlari     23 satır /  6 müşteri
--     stok_kalemleri   3.937 satır /  7 müşteri  ← GERÇEK ENVANTER
--   Portal `stok_kalemleri`'nden okur (SN'li kalem = fiziksel cihaz).
--
-- ⚠️ HASSAS KOLONLAR MÜŞTERİYE GİTMEZ: stok_kalemleri `cihaz_kullanici`,
--   `cihaz_sifre`, `ip_adresi`, `mac_adresi`, `nvr_bilgisi` taşıyor. RLS satır
--   bazlıdır — tabloyu açmak bu kolonları da açardı. mig 296'daki desen:
--   yalnız güvenli kolonları taşıyan GÖRÜNÜM.
--   ⚠️ Bu görünüme yeni kolon eklerken cihaz şifresi/erişim bilgisi KURALI korunmalı.
--
-- ⚠️ SATIR FİLTRESİ GÖRÜNÜMÜN İÇİNDE: `musteri_id = current_musteri_id()`.
--   Böylece müşteri yalnız kendi cihazını görür; ayrıca RLS'e gerek kalmaz.
--
-- CANLI VERİ DURUMU (16.08 ölçümü) — arayüz hazır, veri girildikçe dolar:
--   sahada 166 kalem (7 müşteri) · model 166/166 · takılma tarihi 166/166
--   marka   18/166 · musteri_lokasyon_id 6/166 · alt_lokasyon metin 11/166
--   garanti_bitis_tarihi 0/166
--   ⚠️ arizali_depoda (1) ve teknisyende (45) kalemlerde musteri_id NULL —
--      cihaz müşteriden ayrılınca bağ kopuyor, bu yüzden müşteri "tamirdeki"
--      cihazını GÖREMEZ. Bunun için ayrı bir akış kararı gerekiyor (bkz. rapor).

begin;

create or replace view public.portal_cihazlarim as
  select
    k.id,
    k.seri_no,
    k.marka,
    k.model,
    k.durum,
    k.kanal_no,
    k.takilma_tarihi,
    k.sokulme_tarihi,
    k.garanti_bitis_tarihi,
    k.alt_lokasyon,
    l.ad          as lokasyon_ad,
    l.adres       as lokasyon_adres,
    u.stok_adi    as urun_adi,
    u.gorsel_url  as gorsel_url
  from public.stok_kalemleri k
  left join public.musteri_lokasyonlari l on l.id = k.musteri_lokasyon_id
  -- ⚠️ stok_urunler'e bağ FK ile değil stok_kodu METNİ ile kurulu
  left join public.stok_urunler u on u.stok_kodu = k.stok_kodu
 where coalesce(k.silindi, false) = false
   and k.musteri_id is not null
   and k.musteri_id = public.current_musteri_id();

comment on view public.portal_cihazlarim is
  'Müşteri portalı cihaz envanteri. CİHAZ ŞİFRESİ / KULLANICI ADI / IP / MAC / '
  'NVR bilgisi KOLONU YOKTUR — yeni kolon eklerken bu kural korunmalı (mig 298). '
  'Satır filtresi görünümün içinde: current_musteri_id().';

revoke all on public.portal_cihazlarim from public, anon;
grant select on public.portal_cihazlarim to authenticated;

commit;
