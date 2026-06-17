-- Migration 050: Kullanıcıyı tamamen sil — kullanicilar satiri + auth.users kaydi
-- Boylece ayni e-posta ile tekrar kayit olunabilir (auth.users'da email cakismaz).
-- Yalnizca yoneticiler calistirabilir (yonetici_mi).

create or replace function kullanici_tam_sil(p_id bigint)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  hedef_auth uuid;
  silinebilir_mi boolean;
begin
  if not yonetici_mi() then
    raise exception 'Yetkisiz: yalnızca yöneticiler kullanıcı silebilir.';
  end if;

  select auth_id, silinebilir into hedef_auth, silinebilir_mi
  from kullanicilar where id = p_id;

  if not found then
    raise exception 'Kullanıcı bulunamadı: %', p_id;
  end if;
  if silinebilir_mi is false then
    raise exception 'Bu kullanıcı silinemez.';
  end if;

  -- Once profil satirini sil
  delete from kullanicilar where id = p_id;

  -- Sonra auth.users kaydini sil (identities/sessions FK cascade ile temizlenir)
  if hedef_auth is not null then
    delete from auth.users where id = hedef_auth;
  end if;
end;
$$;

grant execute on function kullanici_tam_sil(bigint) to authenticated;

notify pgrst, 'reload schema';
