-- 292 — ACİL: Yedek tablolar anonim erişime AÇIKTI (canlı veri sızıntısı)
--
-- BULGU (15.08 güvenlik taraması, CANLIDA KANITLANDI):
-- İki yedek tabloda RLS KAPALI ve anon/authenticated rollerine
-- SELECT+INSERT+UPDATE+DELETE+TRUNCATE yetkisi vardı. Giriş YAPMAMIŞ biri,
-- istemci paketinde zaten açıkta duran anon anahtarıyla veriyi okuyabiliyordu:
--
--   GET /rest/v1/musteriler_yedek_cari_import_20260724  -> HTTP 200 (417 satır)
--   GET /rest/v1/kullanicilar_yedek_omer_20260727       -> HTTP 200 (2 satır)
--   GET /rest/v1/musteriler  (kontrol)                  -> HTTP 401  ✓ korumalı
--
-- Sızan alanlar: firma unvanı, adres, telefon, e-posta, vergi no, notlar.
-- DELETE/TRUNCATE yetkisi de vardı — veri okunabildiği gibi SİLİNEBİLİRDİ de.
--
-- KÖK NEDEN: `create table ... as select` ile alınan yedekler public şemada
-- doğar; Supabase'in varsayılan grant'leri anon/authenticated'a işler ve
-- RLS varsayılan KAPALI gelir. 24.07 güvenlik taraması "anonim erişim sıfır"
-- demişti — doğruydu, bu tablolar taramadan SONRA (24.07 ve 27.07) oluşmuş.
--
-- ⚠️ DERS: `create table as select` ile yedek almak, o veriyi İNTERNETE AÇAR.
-- Yedek tablo oluşturan her migration bu bloğu da içermeli.
--
-- BU MIGRATION: veriyi SİLMEZ (yedekler duruyor), yalnız erişimi kapatır.
-- Politika eklenmiyor: RLS açık + politika yok = service_role dışında kimse
-- okuyamaz. Yedeğe erişmek gerekirse SQL konsolundan (postgres rolü) bakılır.

begin;

-- ── 1) Yetkileri geri al ─────────────────────────────────────────────────────
revoke all on public.kullanicilar_yedek_omer_20260727        from anon, authenticated, public;
revoke all on public.musteriler_yedek_cari_import_20260724   from anon, authenticated, public;

-- ── 2) RLS'i aç (politika YOK → varsayılan reddet) ───────────────────────────
alter table public.kullanicilar_yedek_omer_20260727      enable row level security;
alter table public.musteriler_yedek_cari_import_20260724 enable row level security;
-- FORCE: tablo sahibi bile politikasız okuyamasın (yedek gerçekten kilitli olsun)
alter table public.kullanicilar_yedek_omer_20260727      force row level security;
alter table public.musteriler_yedek_cari_import_20260724 force row level security;

-- ── 3) BUNDAN SONRAKİ yedekler için varsayılan koruma ────────────────────────
-- Yeni tablolar otomatik grant almasın. (Mevcut tablolar etkilenmez; onlar
-- migration'larında zaten açıkça grant alıyor.)
alter default privileges in schema public revoke all on tables from anon;

commit;
