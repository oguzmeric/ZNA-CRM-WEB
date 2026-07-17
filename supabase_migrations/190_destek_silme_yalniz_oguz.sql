-- 190: Destek taleplerini yalnız Oğuz Meriç (kullanicilar.id=2) silebilir
-- (eski policy is_admin() unvan listesiydi — cevap/kapatma kuralıyla aynı hizaya çekildi).
drop policy if exists destek_talepleri_delete on destek_talepleri;
create policy destek_talepleri_delete on destek_talepleri for delete
  using (exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid() and k.id = 2
  ));
