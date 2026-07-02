-- 070: bildirim_ekle RPC — RLS WITH CHECK'in is_staff() alt sorgusuyla
-- güvenilmez şekilde etkileşimini bypass etmek için SECURITY DEFINER wrapper.
--
-- Neden: bildirimler_staff_insert politikası is_staff() TRUE dönmesine
-- rağmen INSERT'i reject ediyordu (Ali/Sadık → Oğuz gibi cross-user
-- görev atamalarında). Bu, Postgres RLS WITH CHECK içindeki EXISTS/subquery
-- planner davranışıyla ilgili bir edge case. Bypass etmek en temiz yol.
--
-- Güvenlik: caller staff (rol IN admin/personel, hesap silinmemiş) olmalı
-- veya alici_id kendi kullanıcı id'si olmalı. Aksi halde exception.

create or replace function public.bildirim_ekle(
  p_alici_id bigint,
  p_baslik text,
  p_mesaj text default '',
  p_tip text default 'bilgi',
  p_link text default '',
  p_meta jsonb default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gonderen_id bigint;
  v_caller_rol text;
  v_caller_silindi boolean;
  v_alici_ownership boolean;
  v_yeni_id bigint;
begin
  -- Caller'ın kullanici kaydını bul
  select id, rol, coalesce(hesap_silindi, false)
    into v_gonderen_id, v_caller_rol, v_caller_silindi
    from public.kullanicilar
   where auth_id = auth.uid()
   limit 1;

  if v_gonderen_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_caller_silindi then
    raise exception 'Silinmiş hesap bildirim gönderemez';
  end if;

  -- Yetki: ya staff ol ya kendine gönder
  v_alici_ownership := (p_alici_id = v_gonderen_id);
  if not v_alici_ownership and v_caller_rol not in ('admin', 'personel') then
    raise exception 'Bildirim gönderme yetkin yok';
  end if;

  insert into public.bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
  values (p_alici_id, v_gonderen_id, p_baslik, coalesce(p_mesaj,''), coalesce(p_tip,'bilgi'), coalesce(p_link,''), p_meta)
  returning id into v_yeni_id;

  return v_yeni_id;
end;
$$;

grant execute on function public.bildirim_ekle(bigint, text, text, text, text, jsonb) to authenticated;

-- Toplu ekleme (çoklu alıcı) — servis talep bildirimleri, @mention vs.
create or replace function public.bildirim_ekle_coklu(
  p_alici_idler bigint[],
  p_baslik text,
  p_mesaj text default '',
  p_tip text default 'bilgi',
  p_link text default '',
  p_meta jsonb default null
) returns setof bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gonderen_id bigint;
  v_caller_rol text;
  v_caller_silindi boolean;
  v_id bigint;
  v_alici bigint;
begin
  select id, rol, coalesce(hesap_silindi, false)
    into v_gonderen_id, v_caller_rol, v_caller_silindi
    from public.kullanicilar
   where auth_id = auth.uid()
   limit 1;

  if v_gonderen_id is null then raise exception 'Oturum bulunamadı'; end if;
  if v_caller_silindi then raise exception 'Silinmiş hesap bildirim gönderemez'; end if;
  if v_caller_rol not in ('admin', 'personel') then
    -- Personel/admin olmayan caller sadece kendine gönderebilir
    foreach v_alici in array p_alici_idler loop
      if v_alici <> v_gonderen_id then
        raise exception 'Bildirim gönderme yetkin yok';
      end if;
    end loop;
  end if;

  foreach v_alici in array p_alici_idler loop
    insert into public.bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
    values (v_alici, v_gonderen_id, p_baslik, coalesce(p_mesaj,''), coalesce(p_tip,'bilgi'), coalesce(p_link,''), p_meta)
    returning id into v_id;
    return next v_id;
  end loop;
end;
$$;

grant execute on function public.bildirim_ekle_coklu(bigint[], text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
