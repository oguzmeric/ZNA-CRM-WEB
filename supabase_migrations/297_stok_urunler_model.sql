-- 297 — stok_urunler.model kolonu + mevcut 2.432 ürün için otomatik doldurma
--
-- İHTİYAÇ: portal kataloğunda "marka / model / kategori" üçlüsü isteniyor.
-- kategori_id ve marka zaten vardı; MODEL kolonu YOKTU — üretici kodu
-- `stok_adi` metninin içinde duruyordu ([[reference_stok_kodu_model_kodu]]:
-- `stok_kodu` STK iç sayacıdır, kullanıcının bildiği kod stok_adi'ndedir).
--
-- ⚠️ DOLDURMA HEURİSTİKTİR, %100 DEĞİL. Kuru çalıştırmayla ölçüldü:
--     kural 1 (tireli kod)      1.315 ürün — örnek isabeti 18/17
--     kural 2 (ilk iki token)     399 ürün — örnek isabeti 16/14
--     toplam                    1.714 / 2.432 = %70,5
--   Kalan %29,5 gerçekten modelsiz açıklama satırı ("İÇ ORTAM 2MP DOME
--   KAMERA", "4 ANALOG DIŞHAT 144 ANALOG ABONE") — boş bırakılıyor.
--   Bilinen gürültü: "SATA3", "CAT6A" gibi standart adları model sanılabiliyor;
--   "SIEMENS FDCIO221 Cerberus-Pro" örneğinde ürün ailesi seçiliyor.
--   Model YARDIMCI alandır (arama + gösterim), iş mantığı buna bağlanmamalı.
--
-- ⚠️ İDEMPOTENT: yalnız `model IS NULL` satırlara yazar. Elle düzeltilen
--   değerin üzerine ASLA yazmaz; migration tekrar çalıştırılabilir.

begin;

alter table public.stok_urunler add column if not exists model text;

comment on column public.stok_urunler.model is
  'Üretici model kodu. mig 297''de stok_adi''ndan heuristik çıkarıldı (%70 kapsam); '
  'elle düzeltilebilir — doldurma yalnız NULL satırlara yazar.';

-- ── Kural 1: tireli model kodu (DS-7216HGHI-K1, HAC-HFW1500TL-A-0360B-S2) ──
-- Harfle başlar, en az bir tire içerir. En yaygın ve en güvenilir kalıp.
update public.stok_urunler
   set model = (regexp_match(
         stok_adi,
         '(^|[^A-Za-z0-9-])([A-Za-z][A-Za-z0-9]{0,14}(-[A-Za-z0-9]+)+)'))[2]
 where model is null
   and stok_adi is not null
   and (regexp_match(stok_adi,
         '(^|[^A-Za-z0-9-])([A-Za-z][A-Za-z0-9]{0,14}(-[A-Za-z0-9]+)+)'))[2] is not null;

-- ── Kural 2: ilk İKİ token içinde harfle başlayıp rakam içeren ilk kelime ──
-- (IPH101 KAREL · MS48IP 6/18 · SAMSUNG PM893 960GB → PM893)
-- ⚠️ Yalnız ilk iki token'a bakılır: sonraki kelimelerde "2MP", "100W" gibi
--    teknik birimler model sanılırdı. Rakamla BAŞLAYAN token reddedilir
--    ("5x10 N2XH" → 5x10 elenir, N2XH seçilir).
update public.stok_urunler
   set model = (regexp_match(
         regexp_replace(btrim(stok_adi, ' "'''), '^(\S+\s+\S+).*$', '\1'),
         '(^|\s)([A-Za-z][A-Za-z0-9]*[0-9][A-Za-z0-9]*)'))[2]
 where model is null
   and stok_adi is not null
   and (regexp_match(
         regexp_replace(btrim(stok_adi, ' "'''), '^(\S+\s+\S+).*$', '\1'),
         '(^|\s)([A-Za-z][A-Za-z0-9]*[0-9][A-Za-z0-9]*)'))[2] is not null;

-- Boş string kalmasın (filtre/arama tarafında NULL ile boş ayrı davranmasın)
update public.stok_urunler set model = null where btrim(coalesce(model,'')) = '';

-- Arama için indeks — portal katalog aramasında model de taranıyor
create index if not exists stok_urunler_model_idx
  on public.stok_urunler (lower(model)) where model is not null;

-- ── Portal görünümüne model eklenir (mig 296'daki güvenli kolon kuralı korunur:
--    fiyat / maliyet / tedarikçi / stok kolonu YOK) ──
-- ⚠️ `create or replace view` kolon SIRASI değişince "cannot change name of view
--    column" hatası verir; araya kolon eklemek için DROP + CREATE şart.
--    Drop grant'leri de siler — aşağıda yeniden veriliyor.
drop view if exists public.portal_katalog;
create view public.portal_katalog as
  select id, stok_kodu, stok_adi, marka, model, grup_kodu, kategori_id,
         birim, aciklama, gorsel_url, dokuman_url, dokuman_ad
    from public.stok_urunler
   where katalogda_goster = true
     and aktif = true;

revoke all on public.portal_katalog from public, anon;
grant select on public.portal_katalog to authenticated;

commit;
