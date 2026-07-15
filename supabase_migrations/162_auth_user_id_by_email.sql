-- Portal davet kabulünde "A user with this email address has already been registered"
-- hatasının parçası: edge fn yalnızca public.kullanicilar'a bakıp auth.users'ta zaten
-- kayıt olup olmadığını göremiyordu. Orphan auth kullanıcısı (auth.users'ta var,
-- kullanicilar'da yok) varsa kod createUser koluna düşüp kalıcı hata veriyordu.
--
-- Bu fonksiyon edge fn'e (service_role) auth.users'ta email sorgulama imkânı verir.
-- Sadece uuid döner — hiçbir hassas alan (şifre hash, token) sızmaz.

create or replace function auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
stable
as $$
  select id from auth.users
   where lower(email) = lower(btrim(p_email))
   order by created_at asc
   limit 1;
$$;

-- Sadece service_role çağırabilsin (mig 098 deseni)
revoke all on function auth_user_id_by_email(text) from public;
revoke all on function auth_user_id_by_email(text) from anon;
revoke all on function auth_user_id_by_email(text) from authenticated;
grant execute on function auth_user_id_by_email(text) to service_role;

notify pgrst, 'reload schema';
