-- 189: Destek taleplerini yalnız Oğuz Meriç (kullanicilar.id=2) cevaplayabilir/kapatabilir.
-- Talep açma (insert) herkese açık kalır; select değişmedi (herkes kendininkini, staff hepsini görür).
drop policy if exists destek_talepleri_update on destek_talepleri;
create policy destek_talepleri_update on destek_talepleri for update
  using (exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid() and k.id = 2
  ));
