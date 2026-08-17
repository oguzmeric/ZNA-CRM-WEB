-- 301 — Portal TEKLİF TALEBİ: müşteri kimliği bağı + RLS'i isimden ID'ye taşı
--
-- NEDEN (17.08): Portal 1-2 hafta içinde onlarca firmaya açılıyor.
-- `musteri_teklif_talepleri` tablosunda `musteri_id` YOKTU — talep yalnız
-- `firma_adi` METNİ ile duruyordu. Sonuçları:
--   • Portalden gelen teklif talebi müşteri kartında görünmüyor
--   • Teklife dönüştürülünce müşteri bağı elle kuruluyor
--
-- 🔴 DAHA CİDDİSİ — RLS DE İSİM ÜZERİNDEN ÇALIŞIYORDU:
--     using (firma_adi = (select firma_adi from kullanicilar where auth_id = auth.uid()))
--   1) Aynı ada sahip İKİ müşteri birbirinin taleplerini GÖREBİLİRDİ.
--   2) `kullanicilar.firma_adi` ile kayıt arasındaki tek harf/boşluk farkı
--      müşteriyi kendi talebinden koparırdı (Türkçe İ/I tuzağı dahil).
--   Aynı desen daha önce de yaşandı (isim bazlı yetki, fail-open riski).
--
-- ⚠️ GEÇİŞ GÜVENLİ: `firma_adi` kolonu KALDIRILMIYOR ve eski kural, yalnız
-- `musteri_id` boş kayıtlar için yedek olarak korunuyor. Böylece kimliği
-- eşleşmemiş eski kayıtlar müşterinin gözünden kaybolmaz.

begin;

-- ── 1) Kolon + indeks ─────────────────────────────────────────────────────
alter table public.musteri_teklif_talepleri
  add column if not exists musteri_id bigint
  references public.musteriler(id) on delete set null;

create index if not exists musteri_teklif_talepleri_musteri_id_idx
  on public.musteri_teklif_talepleri (musteri_id)
  where musteri_id is not null;

-- ── 2) Mevcut kayıtları bağla — YALNIZ TEK VE KESİN EŞLEŞME ───────────────
-- Bulanık eşleştirme YOK; aynı normalize ada birden çok müşteri düşerse atlanır.
with eslesme as (
  select t.id as talep_id, min(m.id) as m_id, count(*) as adet
    from public.musteri_teklif_talepleri t
    join public.musteriler m
      on lower(regexp_replace(coalesce(m.firma,''), '[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]', '', 'g'))
       = lower(regexp_replace(coalesce(t.firma_adi,''), '[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]', '', 'g'))
   where t.musteri_id is null
     and coalesce(btrim(t.firma_adi),'') <> ''
   group by t.id
  having count(*) = 1
)
update public.musteri_teklif_talepleri t
   set musteri_id = e.m_id
  from eslesme e
 where e.talep_id = t.id;

-- ── 3) RLS: kimlik önce, isim yalnız YEDEK ────────────────────────────────
drop policy if exists musteri_teklif_talepleri_customer_select on public.musteri_teklif_talepleri;
create policy musteri_teklif_talepleri_customer_select
  on public.musteri_teklif_talepleri for select
  using (
    -- ⭐ Asıl kural: kimlik eşleşmesi
    (musteri_id is not null and musteri_id = (select public.current_musteri_id()))
    -- Yedek: kimliği bağlanamamış ESKİ kayıtlar isimle görünmeye devam etsin
    or (musteri_id is null and firma_adi = (
          select k.firma_adi from public.kullanicilar k where k.auth_id = auth.uid()))
  );

-- INSERT: yeni kayıt kendi müşterisine yazılmak ZORUNDA.
-- ⚠️ Portal formu artık musteri_id gönderiyor; göndermeyen eski istemci
-- kalırsa isim kuralıyla yine yazabilir (kilitlemiyoruz, portal kesilmesin).
drop policy if exists musteri_teklif_talepleri_customer_insert on public.musteri_teklif_talepleri;
create policy musteri_teklif_talepleri_customer_insert
  on public.musteri_teklif_talepleri for insert
  with check (
    (musteri_id is not null and musteri_id = (select public.current_musteri_id()))
    or (musteri_id is null and firma_adi = (
          select k.firma_adi from public.kullanicilar k where k.auth_id = auth.uid()))
  );

commit;
