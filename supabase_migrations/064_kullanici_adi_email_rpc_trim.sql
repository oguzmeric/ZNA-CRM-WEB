-- Migration 063 RPC'si yalnizca input'u trim ediyordu; kullanicilar.kullanici_adi
-- icinde trailing/leading space olan kayitlarda (orn 'znatest ') eslesme bos
-- donuyordu. Hem column hem input trim edilmeli + email NULL ise sentetik
-- @zna.local fallback'i de RPC icine alinmali (mobile uygulama eski surumden
-- guncellenmemis olsa bile dogru email donsun).

create or replace function kullanici_adi_email_cozumle(p_kullanici_adi text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_kullanici_adi text;
begin
  if p_kullanici_adi is null or length(trim(p_kullanici_adi)) = 0 then
    return null;
  end if;
  -- Hem column hem input trim + lower (trailing space tolerant)
  select email, kullanici_adi into v_email, v_kullanici_adi
    from kullanicilar
   where lower(trim(kullanici_adi)) = lower(trim(p_kullanici_adi))
     and (hesap_silindi is null or hesap_silindi = false)
   limit 1;

  -- Email NULL ise sentetik @zna.local fallback (admin-created legacy
  -- kullanicilar icin). regex ile alfanumerik di$inda her sey silinir,
  -- frontend'deki kullaniciAdiToEmail() ile birebir ayni mantik.
  if v_email is null or length(trim(v_email)) = 0 then
    if v_kullanici_adi is not null then
      return lower(regexp_replace(trim(v_kullanici_adi), '[^a-z0-9]', '', 'gi')) || '@zna.local';
    end if;
    return null;
  end if;

  return v_email;
end;
$$;

notify pgrst, 'reload schema';
