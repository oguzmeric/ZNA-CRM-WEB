-- Burak Kurtcebe: sadece kendisinin "görüşen" olduğu görüşmeleri okuyabilir.
-- Yazma (insert/update/delete) tüm personel için serbest — kısıt sadece SELECT'te.
-- gorusen alanı virgülle ayrılmış birden fazla ad tutabildiği için trim'li tokenize check.
-- İleride başka kullanıcılar için de kısıt gerekirse: kullanicilar tablosuna
-- bir "gorusmeler_sadece_kendi bool" kolonu eklenip bu helper üzerinden bakılabilir.

-- Adım 1: Aktif kullanıcının adını döndüren helper
create or replace function public.current_kullanici_ad()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ad from kullanicilar where auth_id = auth.uid();
$$;

-- Adım 2: Yalnızca kendi görüşmelerini görmesi gereken kullanıcı adı listesi.
-- Şimdilik tek kayıt (Burak Kurtcebe); istenirse buraya başka isim eklenebilir.
create or replace function public.gorusmeler_sadece_kendi_mi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_kullanici_ad() ilike '%burak%kurtcebe%';
$$;

-- Adım 3: Mevcut "for all" policy'yi kaldır, SELECT'i kısıtlı hale getir
drop policy if exists "gorusmeler_staff_all"    on gorusmeler;
drop policy if exists "gorusmeler_staff_select" on gorusmeler;
drop policy if exists "gorusmeler_staff_insert" on gorusmeler;
drop policy if exists "gorusmeler_staff_update" on gorusmeler;
drop policy if exists "gorusmeler_staff_delete" on gorusmeler;

-- SELECT: personel; ama sınırlı listedeyse sadece gorusen'de adı geçenler
create policy "gorusmeler_staff_select" on gorusmeler
  for select
  using (
    is_staff() and (
      not gorusmeler_sadece_kendi_mi()
      or exists (
        select 1
        from unnest(string_to_array(coalesce(gorusen, ''), ',')) as x(ad)
        where trim(x.ad) = current_kullanici_ad()
      )
    )
  );

-- INSERT/UPDATE/DELETE: personel serbest (kısıt yok — kayıt oluşturma engellenmesin)
create policy "gorusmeler_staff_insert" on gorusmeler
  for insert with check (is_staff());

create policy "gorusmeler_staff_update" on gorusmeler
  for update using (is_staff()) with check (is_staff());

create policy "gorusmeler_staff_delete" on gorusmeler
  for delete using (is_staff());

-- PostgREST schema cache'ini yenile ki fonksiyonlar/policy güncellemesi anında etkisin
notify pgrst, 'reload schema';
