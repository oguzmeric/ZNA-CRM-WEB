-- 300 — Servis talebine LOKASYON KİMLİĞİ köprüsü
--
-- NEDEN (17.08): Müşteri portalı 1-2 hafta içinde açılıyor; Bayrampaşa
-- Belediyesi gibi ÇOK LOKASYONLU firmalar talepleri buradan gönderecek
-- (Bayrampaşa: 55 tanımlı lokasyon). `servis_talepleri.lokasyon` şu ana kadar
-- SERBEST METİN'di — kayıtla bağı yoktu.
--
-- ⚠️ Metin bağının bedeli ÖLÇÜLDÜ: sahadaki 166 cihazın lokasyonu bu yüzden
-- boş kaldı; "hangi binada kaç arıza var" sorusu güvenilir cevaplanamıyordu.
-- Keşiflerde `lokasyon_id` zaten vardı (mig 236), servis taleplerinde yoktu.
--
-- ⚠️ METİN KOLONU KALDIRILMIYOR. İki sebeple:
--   1) Lokasyonu tanımlı olmayan 2.006 müşteri serbest metin yazmaya devam
--      edecek (portal formu buna göre uyarlanıyor: liste varsa seçici,
--      yoksa metin). Metni silmek onların verisini silmek olurdu.
--   2) Geçmiş kayıtların metni tarihsel belge — eşleşmese de okunabilmeli.
-- `lokasyon_id` KESİN bağ, `lokasyon` görüntü/serbest giriş olarak yaşar.

begin;

-- ── 1) Kolon + indeks ─────────────────────────────────────────────────────
alter table public.servis_talepleri
  add column if not exists lokasyon_id bigint
  references public.musteri_lokasyonlari(id) on delete set null;

create index if not exists servis_talepleri_lokasyon_id_idx
  on public.servis_talepleri (lokasyon_id)
  where lokasyon_id is not null;

-- ── 2) Geçmiş kayıtları bağla — YALNIZ KESİN EŞLEŞME ──────────────────────
-- Ölçüm (17.08): lokasyon metni dolu 149 talebin 138'i tanımlı bir lokasyonla
-- TAM eşleşiyor. Kalan 11'i metin olarak kalır — uydurma eşleştirme YAPILMAZ.
--
-- ⚠️ BULANIK EŞLEŞME BİLEREK YOK: dün ELEMENT'in 148 cihazında denendi ve
-- vazgeçildi — "yanlış lokasyon, boş lokasyondan kötüdür". Burada da yalnız
-- noktalama/boşluk farkları normalize edilir, kelime bazlı tahmin yapılmaz.
--
-- ⚠️ ÇOKLU EŞLEŞME DE ATLANIR: canlıda aynı ada sahip lokasyon çiftleri var
-- (ŞAMLAR MOLA KAFE, Rizom Tatil Köyü). Hangisi olduğu belirsizse bağlanmaz.
with norm as (
  select t.id, t.musteri_id,
         lower(regexp_replace(coalesce(t.lokasyon,''), '[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]', '', 'g')) as t_norm
    from public.servis_talepleri t
   where t.lokasyon_id is null
     and coalesce(btrim(t.lokasyon),'') <> ''
     and t.musteri_id is not null
), eslesme as (
  select n.id as talep_id, min(l.id) as lok_id, count(*) as adet
    from norm n
    join public.musteri_lokasyonlari l
      on l.musteri_id = n.musteri_id
     and lower(regexp_replace(l.ad, '[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]', '', 'g')) = n.t_norm
   group by n.id
  having count(*) = 1          -- belirsizse bağlama
)
update public.servis_talepleri t
   set lokasyon_id = e.lok_id
  from eslesme e
 where e.talep_id = t.id;

commit;
