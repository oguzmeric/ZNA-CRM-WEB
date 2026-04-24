-- =====================================================================
-- Görevler — rol bazlı RLS
-- =====================================================================
-- Admin her görevi okur/yazar. Personel yalnızca kendisine atanan veya
-- kendisinin oluşturduğu görevleri okur/yazar. Müşteri erişemez.
-- =====================================================================

-- RLS'i açıp zorla — gorevler tablosunda daha önce enable edilmemişti
alter table gorevler enable row level security;
alter table gorevler force row level security;

-- Eski policy'leri temizle
drop policy if exists "gorevler_staff_all" on gorevler;
drop policy if exists "gorevler_admin_all" on gorevler;
drop policy if exists "gorevler_personel_self" on gorevler;

-- 1. Admin: tam erişim
create policy "gorevler_admin_all" on gorevler
  for all using (is_admin()) with check (is_admin());

-- 2. Personel: yalnızca kendisiyle ilgili görevler
-- atanan (text, legacy), atanan_id (bigint), atanan_ad (text) ve
-- olusturan_ad (text) alanlarından herhangi biri kullanıcıyla eşleşmeli.
create policy "gorevler_personel_self" on gorevler
  for all
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan   = (select id::text from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
    )
  )
  with check (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan   = (select id::text from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
    )
  );

notify pgrst, 'reload schema';
