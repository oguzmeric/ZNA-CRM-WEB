-- 279 — Avans taksit üst sınırı 12 → 4 (10.08.2026 kararı)
--
-- Gerekçe: 12 taksit fazla bulundu; avans maaştan kesildiği için uzun vade
-- hem personelin borcunu yıla yayıyor hem takibi zorlaştırıyordu.
--
-- ⚠️ MEVCUT KAYIT KORUNUR: canlıda 12 taksitli bir talep var (id 2, reddedilmiş).
-- Kısıt NOT VALID eklenir — geçmiş satırlar denetlenmez, yalnız YENİ ekleme ve
-- güncellemeler 1–4 kuralına tabidir. Böylece tarihsel kayıt bozulmadan durur
-- ve migration da hata vermez.
--
-- Sınır ÜÇ katmanda birden tutulur (biri atlanırsa diğerleri yakalar):
--   1) UI seçenek listesi  — TAKSIT_SECENEKLERI (web + mobil ikService)
--   2) Servis guard'ı      — avansTalepEkle: taksit > MAKS_TAKSIT → hata
--   3) Bu CHECK kısıtı     — son savunma; doğrudan API çağrısı da geçemez

begin;

alter table public.avans_talepleri
  drop constraint if exists avans_talepleri_taksit_sayisi_check;

alter table public.avans_talepleri
  add constraint avans_talepleri_taksit_sayisi_check
  check (taksit_sayisi >= 1 and taksit_sayisi <= 4) not valid;

commit;

-- Doğrulama:
--   select conname, pg_get_constraintdef(oid), convalidated
--     from pg_constraint
--    where conrelid = 'public.avans_talepleri'::regclass and contype = 'c';
--   → taksit_sayisi_check: CHECK ((taksit_sayisi >= 1) AND (taksit_sayisi <= 4))
--     convalidated = false (geçmiş satırlar denetlenmedi — bilinçli)
