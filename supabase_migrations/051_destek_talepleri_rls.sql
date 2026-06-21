-- Migration 051: destek_talepleri RLS politikaları
-- Tabloda RLS açıktı ama hiç politika yoktu → normal kullanıcı insert/select yapamıyordu
-- (destek talebi oluşturma "Talep gönderilemedi" hatası veriyordu).
-- Kullanıcı kendi talebini oluşturur/görür; personel/admin (is_staff) hepsini görür ve cevaplar.

alter table destek_talepleri enable row level security;

-- Idempotent: varsa düşür
drop policy if exists destek_talepleri_insert on destek_talepleri;
drop policy if exists destek_talepleri_select on destek_talepleri;
drop policy if exists destek_talepleri_update on destek_talepleri;
drop policy if exists destek_talepleri_delete on destek_talepleri;

-- INSERT: kullanıcı kendi adına talep oluşturabilir (kullanici_id = kendi kullanicilar.id), personel de oluşturabilir
create policy destek_talepleri_insert on destek_talepleri
  for insert to authenticated
  with check (
    kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
    or is_staff()
  );

-- SELECT: kendi talepleri + personel/admin hepsini görür
create policy destek_talepleri_select on destek_talepleri
  for select to authenticated
  using (
    kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
    or is_staff()
  );

-- UPDATE: personel/admin cevaplayabilir/günceller
create policy destek_talepleri_update on destek_talepleri
  for update to authenticated
  using (is_staff())
  with check (is_staff());

-- DELETE: yalnızca admin
create policy destek_talepleri_delete on destek_talepleri
  for delete to authenticated
  using (is_admin());

notify pgrst, 'reload schema';
