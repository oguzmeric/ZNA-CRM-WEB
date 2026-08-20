-- 318 — portal_cihazlarim görünümü İKİ KAYNAKLI oldu
--
-- VAKA (20.08): ZNA TEST'e SN'li cihaz eklendi (musteri_cihazlari, 13:20,
-- ZNA00000009) ama portal "Cihazlarım" boş kaldı. Sebep: görünüm yalnız
-- stok_kalemleri'nden okuyordu (mig 298 kararı — o gün gerçek envanter
-- oradaydı); musteri_cihazlari'na web/mobil cihaz-ekleme akışları yazıyor
-- ve o kayıtlar portalda GÖRÜNMÜYORDU. Üç-tablo-senkronsuz meselesinin
-- portala yansıması (bkz. reference_cihaz_bilgi_uc_tablo).
--
-- ÇÖZÜM: stok_kalemleri ∪ musteri_cihazlari. Kurallar korunur:
--   • GİZLİLİK (mig 298): cihaz şifresi / kullanıcı adı / IP / MAC görünüme
--     GİRMEZ — musteri_cihazlari bu kolonları taşıyor, bilerek dışarıda.
--   • Satır filtresi görünümün İÇİNDE: current_musteri_id().
--   • id çakışmasın diye kaynak önekli metin id ('sk-…' / 'mc-…') — UI id'yi
--     yalnız React key olarak kullanıyor (Cihazlarim.jsx:211 ölçüldü).
--   • Durum çevirisi: musteri_cihazlari 'aktif/arizali' der; portal haritası
--     'sahada/arizada' bekler (CIHAZ_DURUMLARI) — çeviri görünümde.

begin;

drop view if exists public.portal_cihazlarim;

create view public.portal_cihazlarim as
  select
    'sk-' || k.id::text as id,
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
   and k.musteri_id = public.current_musteri_id()

  union all

  select
    'mc-' || c.id::text as id,
    c.seri_no,
    c.marka,
    c.model,
    case c.durum
      when 'aktif'   then 'sahada'
      when 'arizali' then 'arizada'
      else c.durum
    end as durum,
    null::integer     as kanal_no,
    -- Cihazın müşteriye eklendiği an "takılma" karşılığıdır — portal
    -- sıralaması bu kolona dayanıyor, boş bırakmak kaydı en sona atardı.
    c.olusturma_tarih as takilma_tarihi,
    null::timestamptz as sokulme_tarihi,
    null::date        as garanti_bitis_tarihi,
    null::text        as alt_lokasyon,
    -- musteri_cihazlari lokasyonu METİN tutar (id-metin köprüsü borcu) —
    -- olduğu gibi ad olarak sunulur.
    c.lokasyon        as lokasyon_ad,
    null::text        as lokasyon_adres,
    c.cihaz_adi       as urun_adi,
    null::text        as gorsel_url
  from public.musteri_cihazlari c
 where c.musteri_id = public.current_musteri_id()
   -- Aynı SN iki kaynakta da varsa (ileride senkron kurulursa) çift satır
   -- olmasın: stok_kalemleri kaydı esas, mc kopyası gizlenir.
   and not exists (
     select 1 from public.stok_kalemleri k2
      where k2.seri_no = c.seri_no
        and coalesce(k2.silindi, false) = false
        and k2.musteri_id = c.musteri_id
   );

comment on view public.portal_cihazlarim is
  'Müşteri portalı cihaz envanteri — İKİ KAYNAK: stok_kalemleri (sk-*) + '
  'musteri_cihazlari (mc-*), mig 318. CİHAZ ŞİFRESİ / KULLANICI ADI / IP / MAC '
  'KOLONU YOKTUR — yeni kolon eklerken bu kural korunmalı (mig 298). '
  'Satır filtresi görünümün içinde: current_musteri_id().';

revoke all on public.portal_cihazlarim from public, anon;
grant select on public.portal_cihazlarim to authenticated;

commit;
