-- =====================================================================
-- FAZ 2 — Row Level Security (RLS) politikaları
-- =====================================================================
-- Önkoşul: 001_auth_migration.sql BÖLÜM A + B tamamlanmış ve tüm
-- kullanıcılar giriş yapabilir durumda olmalı.
--
-- Bu script:
--   1. public şemasındaki TÜM tablolarda RLS'i açar
--   2. Yardımcı fonksiyonlar: current_user_profile(), current_user_role()
--   3. Her tabloya uygun policy ekler
--
-- Tek seferde çalıştırılabilir — idempotent (tekrar çalıştırsan bozmaz).
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM A — Yardımcı fonksiyonlar (JWT'den kullanıcı profili)
-- ─────────────────────────────────────────────────────────────────────

-- Giriş yapmış kullanıcının kullanicilar tablosundaki satırını verir.
-- STABLE + security definer: policy'lerde hızlı ve güvenli çağrılır.
create or replace function current_user_profile()
returns table (id bigint, rol text, tip text, musteri_id bigint, firma_adi text)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.rol, k.tip,
         (select m.id from musteriler m where m.firma = k.firma_adi limit 1) as musteri_id,
         k.firma_adi
    from kullanicilar k
   where k.auth_id = auth.uid();
$$;

-- Rolü döner ('admin' | 'personel' | 'musteri'); giriş yapılmamışsa null
create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from kullanicilar where auth_id = auth.uid();
$$;

-- Kolaylık: "personel veya admin mi?" ve "admin mi?"
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol in ('admin','personel') from kullanicilar where auth_id = auth.uid()),
    false
  );
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol = 'admin' from kullanicilar where auth_id = auth.uid()),
    false
  );
$$;

-- Müşteri kullanıcısı için bağlı olduğu musteri.id
create or replace function current_musteri_id()
returns bigint language sql stable security definer set search_path = public as $$
  select m.id
    from musteriler m
    join kullanicilar k on k.firma_adi = m.firma
   where k.auth_id = auth.uid() and k.tip = 'musteri'
   limit 1;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM B — Tüm public tablolarda RLS'i aç
-- ─────────────────────────────────────────────────────────────────────
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not like 'pg_%'
  loop
    execute format('alter table public.%I enable row level security;', t.tablename);
    execute format('alter table public.%I force row level security;',  t.tablename);
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM C — Policy temizleme (idempotent yeniden çalıştırma için)
-- ─────────────────────────────────────────────────────────────────────
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I;', p.policyname, p.tablename);
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM D — Policy'ler
-- ─────────────────────────────────────────────────────────────────────

-- Personel/admin: CRM'in çoğunu okuyup yazabilir.
-- Müşteri: sadece kendi musteri_id'sine bağlı kayıtları görür.

-- kullanicilar: kullanıcı kendi profilini görebilir; admin hepsini yönetir.
create policy "kullanicilar_self_select" on kullanicilar
  for select using (auth_id = auth.uid() or is_admin());

create policy "kullanicilar_self_update" on kullanicilar
  for update using (auth_id = auth.uid() or is_admin())
             with check (auth_id = auth.uid() or is_admin());

create policy "kullanicilar_admin_insert" on kullanicilar
  for insert with check (is_admin());

create policy "kullanicilar_admin_delete" on kullanicilar
  for delete using (is_admin());

-- musteriler: personel CRUD; müşteri sadece kendini görür.
create policy "musteriler_staff_all" on musteriler
  for all using (is_staff()) with check (is_staff());

create policy "musteriler_customer_self_select" on musteriler
  for select using (id = current_musteri_id());

-- firmalar: personel CRUD
create policy "firmalar_staff_all" on firmalar
  for all using (is_staff()) with check (is_staff());

-- gorusmeler: personel CRUD
create policy "gorusmeler_staff_all" on gorusmeler
  for all using (is_staff()) with check (is_staff());

-- teklifler: personel CRUD; müşteri sadece kendi musteri_id'sindeki teklifleri görür
create policy "teklifler_staff_all" on teklifler
  for all using (is_staff()) with check (is_staff());

create policy "teklifler_customer_self_select" on teklifler
  for select using (musteri_id = current_musteri_id());

-- servis_talepleri: personel CRUD; müşteri kendi taleplerini görür + oluşturur
create policy "servis_talepleri_staff_all" on servis_talepleri
  for all using (is_staff()) with check (is_staff());

create policy "servis_talepleri_customer_select" on servis_talepleri
  for select using (musteri_id = current_musteri_id());

create policy "servis_talepleri_customer_insert" on servis_talepleri
  for insert with check (musteri_id = current_musteri_id());

-- musteri_teklif_talepleri: personel CRUD; müşteri kendininkini yönetir
-- NOT: Bu tabloda musteri_id kolonu yoksa firma_adi ile eşleştir.
create policy "musteri_teklif_talepleri_staff_all" on musteri_teklif_talepleri
  for all using (is_staff()) with check (is_staff());

create policy "musteri_teklif_talepleri_customer_select" on musteri_teklif_talepleri
  for select using (
    firma_adi = (select firma_adi from kullanicilar where auth_id = auth.uid())
  );

create policy "musteri_teklif_talepleri_customer_insert" on musteri_teklif_talepleri
  for insert with check (
    firma_adi = (select firma_adi from kullanicilar where auth_id = auth.uid())
  );

-- kargolar: personel CRUD
create policy "kargolar_staff_all" on kargolar
  for all using (is_staff()) with check (is_staff());

-- stok_urunler: personel CRUD
create policy "stok_urunler_staff_all" on stok_urunler
  for all using (is_staff()) with check (is_staff());

-- stok_hareketleri: personel CRUD
create policy "stok_hareketleri_staff_all" on stok_hareketleri
  for all using (is_staff()) with check (is_staff());

-- stok_kalemleri: koşullu — her kurulumda olmayabilir
do $$
begin
  if to_regclass('public.stok_kalemleri') is not null then
    execute 'create policy "stok_kalemleri_staff_all" on stok_kalemleri for all using (is_staff()) with check (is_staff())';
  end if;
end $$;

-- gorevler: personel CRUD
create policy "gorevler_staff_all" on gorevler
  for all using (is_staff()) with check (is_staff());

-- trassir_lisanslar: personel CRUD; müşteri kendi lisanslarını görür
create policy "trassir_lisanslar_staff_all" on trassir_lisanslar
  for all using (is_staff()) with check (is_staff());

create policy "trassir_lisanslar_customer_select" on trassir_lisanslar
  for select using (musteri_id = current_musteri_id());

-- hatirlatmalar: personel CRUD
create policy "hatirlatmalar_staff_all" on hatirlatmalar
  for all using (is_staff()) with check (is_staff());

-- aktivite_log: personel okuma (audit); insert tüm authenticated
create policy "aktivite_log_staff_select" on aktivite_log
  for select using (is_staff());

create policy "aktivite_log_all_insert" on aktivite_log
  for insert with check (auth.uid() is not null);

-- bildirimler: kullanıcı kendi bildirimlerini okur; admin hepsini yönetir
create policy "bildirimler_self_all" on bildirimler
  for all using (
    kullanici_id = auth.uid()::text
    or is_admin()
  ) with check (
    kullanici_id = auth.uid()::text
    or is_admin()
  );

-- sistem_ayarlari: tüm authenticated okur; sadece admin yazar
create policy "sistem_ayarlari_authenticated_select" on sistem_ayarlari
  for select using (auth.uid() is not null);

create policy "sistem_ayarlari_admin_modify" on sistem_ayarlari
  for all using (is_admin()) with check (is_admin());

-- satislar, satis_satirlari, tahsilatlar, stok_kalemleri,
-- musteri_kisiler, musteri_lokasyonlari — bunlar bazı kurulumlarda yok
-- olabileceğinden koşullu policy ekliyoruz.
do $$
begin
  if to_regclass('public.satislar') is not null then
    execute 'create policy "satislar_staff_all" on satislar for all using (is_staff()) with check (is_staff())';
  end if;

  if to_regclass('public.satis_satirlari') is not null then
    execute 'create policy "satis_satirlari_staff_all" on satis_satirlari for all using (is_staff()) with check (is_staff())';
  end if;

  if to_regclass('public.tahsilatlar') is not null then
    execute 'create policy "tahsilatlar_staff_all" on tahsilatlar for all using (is_staff()) with check (is_staff())';
  end if;

  if to_regclass('public.musteri_kisiler') is not null then
    execute 'create policy "musteri_kisiler_staff_all" on musteri_kisiler for all using (is_staff()) with check (is_staff())';
    execute 'create policy "musteri_kisiler_customer_select" on musteri_kisiler for select using (musteri_id = current_musteri_id())';
  end if;

  if to_regclass('public.musteri_lokasyonlari') is not null then
    execute 'create policy "musteri_lokasyonlari_staff_all" on musteri_lokasyonlari for all using (is_staff()) with check (is_staff())';
    execute 'create policy "musteri_lokasyonlari_customer_select" on musteri_lokasyonlari for select using (musteri_id = current_musteri_id())';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- BÖLÜM E — Storage (görsel yükleme) bucket policy'leri
-- ─────────────────────────────────────────────────────────────────────
-- gorsel upload için bucket: varsa anon SELECT aç, INSERT sadece authenticated

-- Bucket adı: 'stok-gorseller' (mevcut kodda bu isim kullanılıyorsa)
-- Yoksa Supabase Dashboard > Storage > New Bucket ile oluştur.

-- NOT: storage.objects tablosu Supabase yönetir — policy ekle:
-- Aşağıdaki satırları ihtiyaca göre aç:

-- create policy "stok_gorsel_public_read" on storage.objects
--   for select using (bucket_id = 'stok-gorseller');
--
-- create policy "stok_gorsel_staff_insert" on storage.objects
--   for insert with check (bucket_id = 'stok-gorseller' and is_staff());
--
-- create policy "stok_gorsel_staff_delete" on storage.objects
--   for delete using (bucket_id = 'stok-gorseller' and is_staff());


-- ─────────────────────────────────────────────────────────────────────
-- KONTROL — policy'lerin durduğunu doğrula
-- ─────────────────────────────────────────────────────────────────────
-- select schemaname, tablename, rowsecurity, forcerowsecurity
--   from pg_tables where schemaname = 'public' order by tablename;
--
-- select tablename, policyname, cmd
--   from pg_policies where schemaname = 'public' order by tablename, policyname;


-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (acil durum — RLS'i geçici olarak kapat)
-- ─────────────────────────────────────────────────────────────────────
-- do $$
-- declare t record;
-- begin
--   for t in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('alter table public.%I disable row level security;', t.tablename);
--   end loop;
-- end $$;
