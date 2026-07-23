-- 227_rls_initplan_gorusmeler.sql
-- PERFORMANS: "CRM yavaş" şikâyetinin kök nedeni.
--
-- Ölçüm (pg_stat_statements): gorusmeler sorguları ortalama 930 ms, 13.995 çağrı,
-- toplam 3,6 SAATLİK veritabanı zamanı — tüm sistemdeki en pahalı iş, açık ara.
-- Oysa tablo yalnızca 3.380 satır / 3 MB. Gerçek oturumla ölçüm: sadece
-- `select count(*) from gorusmeler` = 482 ms (normalde ~2 ms olmalı).
--
-- Kök neden — RLS'te "auth_rls_initplan" tuzağı:
-- SELECT policy'si dört SECURITY DEFINER fonksiyonunu ÇIPLAK çağırıyordu:
--   is_staff(), crm_rol_admin_mi(), gorusmeler_sadece_kendi_mi(), current_kullanici_ad()
-- Postgres bunları satır-bağımlı sayıp HER SATIR İÇİN yeniden çalıştırıyor.
-- Her biri kullanicilar tablosuna auth.uid() ile gidiyor →
-- 3.380 satır × 4 fonksiyon ≈ 13.500 alt-sorgu, tek liste isteğinde.
--
-- Çözüm: fonksiyon çağrılarını skaler alt-sorguya sar — `(select is_staff())`.
-- Postgres bunu satırdan bağımsız görür, InitPlan olarak BİR KEZ hesaplar.
-- Supabase'in kendi RLS performans rehberinde önerdiği desen budur.
-- MANTIK AYNEN KORUNUYOR — yalnız değerlendirme sayısı değişiyor, kimin neyi
-- gördüğü değişmiyor.

begin;

-- SELECT — asıl maliyetli olan
drop policy if exists gorusmeler_staff_select on public.gorusmeler;
create policy gorusmeler_staff_select on public.gorusmeler
  for select
  using (
    (select is_staff())
    and (yalniz_yonetici = false or (select crm_rol_admin_mi()))
    and (
      (select not gorusmeler_sadece_kendi_mi())
      or exists (
        select 1
          from unnest(string_to_array(coalesce(gorusmeler.gorusen, ''), ',')) x(ad)
         where trim(both from x.ad) = (select current_kullanici_ad())
      )
    )
  );

-- UPDATE / DELETE — tek satırlık işlemler, yine de aynı desen uygulanıyor
drop policy if exists gorusmeler_staff_update on public.gorusmeler;
create policy gorusmeler_staff_update on public.gorusmeler
  for update
  using ((select is_staff()) and (yalniz_yonetici = false or (select crm_rol_admin_mi())));

drop policy if exists gorusmeler_staff_delete on public.gorusmeler;
create policy gorusmeler_staff_delete on public.gorusmeler
  for delete
  using ((select is_staff()) and (yalniz_yonetici = false or (select crm_rol_admin_mi())));

-- Liste sorgusu her zaman olusturma_tarih DESC sıralı geliyor (gorusmeService),
-- ama bu kolonda indeks YOKTU → her istekte tam sıralama.
create index if not exists idx_gorusmeler_olusturma_tarih
  on public.gorusmeler (olusturma_tarih desc);

commit;
