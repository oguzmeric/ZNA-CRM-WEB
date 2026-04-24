-- =====================================================================
-- kullanicilar silindiğinde auth.users'tan da sil (cascade)
-- =====================================================================
-- Sorun: Admin panel sadece kullanicilar tablosundan siliyordu.
-- auth.users satırı orphan kalıyor → aynı email ile yeniden kayıt
-- denendiğinde "User already registered" hatası.
--
-- Çözüm: AFTER DELETE trigger — satır silinince auth.users'tan da sil.
-- SECURITY DEFINER ile postgres yetkisiyle çalışır (auth şemasına erişim).
-- =====================================================================

create or replace function public.delete_auth_user_on_kullanici_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.auth_id is not null then
    delete from auth.users where id = old.auth_id;
  end if;
  return old;
end;
$$;

drop trigger if exists kullanicilar_delete_cascade_auth on public.kullanicilar;

create trigger kullanicilar_delete_cascade_auth
after delete on public.kullanicilar
for each row execute function public.delete_auth_user_on_kullanici_delete();

-- Test / kontrol:
-- select tgname from pg_trigger where tgrelid = 'public.kullanicilar'::regclass;

-- ROLLBACK:
-- drop trigger if exists kullanicilar_delete_cascade_auth on public.kullanicilar;
-- drop function if exists public.delete_auth_user_on_kullanici_delete();
