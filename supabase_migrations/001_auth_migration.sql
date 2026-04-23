-- =====================================================================
-- FAZ 1 — Supabase Auth'a geçiş
-- =====================================================================
-- Bu script 3 bölümde çalıştırılır. Her bölüm kendi başına ATOMİK'tir.
-- Supabase Dashboard → SQL Editor → New Query → yapıştır → Run.
--
-- ÖN KOŞUL: Mevcut veritabanı yedeğini almış olmalısın
-- (Supabase Dashboard → Database → Backups → "Create a backup")
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM A — Şema değişikliği (önce çalıştır)
-- ─────────────────────────────────────────────────────────────────────
-- kullanicilar tablosuna auth.users'a bağlı auth_id ve rol kolonu ekle.
-- sifre kolonunu HENÜZ silmiyoruz; bölüm C'de, migration tamamlandıktan
-- sonra manuel olarak kaldıracağız.

alter table kullanicilar
  add column if not exists auth_id uuid references auth.users(id) on delete set null,
  add column if not exists rol text not null default 'personel',
  add column if not exists email text;

-- Index: auth_id ile hızlı kullanıcı araması
create index if not exists idx_kullanicilar_auth_id on kullanicilar(auth_id);
create index if not exists idx_kullanicilar_email on kullanicilar(email);

-- rol değerleri: 'admin' | 'personel' | 'musteri'
-- Mevcut kullanıcıları tipine göre rolle:
update kullanicilar set rol = 'musteri' where tip = 'musteri' and rol = 'personel';

-- İLK admin kullanıcıyı manuel işaretle.
-- !!! AŞAĞIDAKİ SATIRI KENDİ KULLANICI ADINLA DEĞİŞTİR !!!
-- update kullanicilar set rol = 'admin' where kullanici_adi = 'oguz';


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM B — Supabase Auth kullanıcı oluşturma (manuel adım)
-- ─────────────────────────────────────────────────────────────────────
-- Bu bölüm SQL DEĞİL — Supabase Dashboard üzerinden manuel yapılır.
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user" → "Create new user"
-- 2. HER mevcut kullanıcı için:
--    - Email:    <kullanici_adi>@zna.local      (örn: oguz@zna.local)
--    - Password: güvenli yeni bir şifre seç (eski şifreleri KULLANMA)
--    - "Auto Confirm User" kutusunu işaretle
-- 3. Oluşturulan UUID'yi kopyala.
-- 4. Aşağıdaki UPDATE'i çalıştır (her kullanıcı için):
--
--    update kullanicilar
--       set auth_id = 'BURAYA_UUID_YAPISTIR',
--           email   = 'kullanici_adi@zna.local'
--     where kullanici_adi = 'kullanici_adi';
--
-- NOT: Kullanıcılara yeni şifrelerini kendin bildireceksin
--      (eski şifreler güvensiz olduğundan hepsi sıfırlanıyor).
--
-- ALTERNATIF — Toplu aktarma script'i:
-- scripts/migrate-users.mjs dosyasını çalıştır (kullanıcıyı sen onaylarsan).


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM C — Migration doğrulama + temizlik (EN SON çalıştır)
-- ─────────────────────────────────────────────────────────────────────
-- Bu bölümü SADECE tüm kullanıcılar için auth_id doldurulduktan sonra çalıştır.

-- Kontrol: auth_id'si boş kullanıcı var mı?
-- select id, kullanici_adi, auth_id from kullanicilar where auth_id is null;
-- Sonuç boş DEĞİLSE bölüm B'yi tamamla, sonra aşağıyı çalıştır.

-- auth_id'yi NOT NULL yap ve plaintext sifre kolonunu kaldır:
-- (AŞAĞIDAKİ SATIRLARIN BAŞINDAKİ -- İŞARETLERİNİ KALDIR, SONRA ÇALIŞTIR)

-- alter table kullanicilar
--   alter column auth_id set not null,
--   drop column sifre;


-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (acil durum)
-- ─────────────────────────────────────────────────────────────────────
-- Eğer migration'ı geri almak istersen:
--
-- alter table kullanicilar drop column if exists auth_id;
-- alter table kullanicilar drop column if exists rol;
-- alter table kullanicilar drop column if exists email;
-- drop index if exists idx_kullanicilar_auth_id;
-- drop index if exists idx_kullanicilar_email;
--
-- Supabase Auth → Users'taki oluşturulan kullanıcıları manuel sil.
