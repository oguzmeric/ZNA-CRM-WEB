-- Mobile/web login icin kullanici_adi -> auth email cozumlemesi.
-- Mevcut akış: 's.baloglu' girilirse 'sbaloglu@zna.local' sentetik email
-- yapılıyordu — nokta gibi karakterler silindigi icin gercek auth email
-- ('s.baloglu@znateknoloji.com') ile uyusmuyor. Bu RPC ile login sayfası
-- once gercek emaili cozumler, sonra auth dener.
--
-- SECURITY DEFINER ile anon rol cagirabilir. Sadece email donerir,
-- diger profil bilgilerini sizdirmaz. Var olmayan kullanicida null doner.

create or replace function kullanici_adi_email_cozumle(p_kullanici_adi text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_kullanici_adi is null or length(trim(p_kullanici_adi)) = 0 then
    return null;
  end if;
  -- exact match on kullanici_adi (case-insensitive)
  select email into v_email
    from kullanicilar
   where lower(kullanici_adi) = lower(trim(p_kullanici_adi))
     and email is not null
     and email <> ''
     and (hesap_silindi is null or hesap_silindi = false)
   limit 1;
  return v_email;
end;
$$;

-- anon ve authenticated rollerine execute izni
grant execute on function kullanici_adi_email_cozumle(text) to anon, authenticated;

notify pgrst, 'reload schema';
