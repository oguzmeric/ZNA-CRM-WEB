-- Migration 049: Kullanıcı self-kayıt onay/yetkilendirme akışı
-- - kullanicilar'a onay durumu kolonları
-- - admin onay kuyruğu + onayla/reddet RPC'leri (SECURITY DEFINER)
-- Admin tanımı: rol='admin' (is_admin) VEYA yönetici unvanı (admin_sifre_sifirla ile aynı liste)

-- 1) Kolonlar
alter table kullanicilar
  add column if not exists onay_durum   text default 'onaylandi',
  add column if not exists onay_tarihi  timestamptz,
  add column if not exists onaylayan_id bigint references kullanicilar(id) on delete set null,
  add column if not exists red_nedeni   text;

-- Mevcut tüm satırlar onaylı (kimse kilitlenmesin)
update kullanicilar set onay_durum = 'onaylandi' where onay_durum is null;

-- Değer kısıtı (varsa önce düşür, idempotent)
alter table kullanicilar drop constraint if exists kullanicilar_onay_durum_chk;
alter table kullanicilar
  add constraint kullanicilar_onay_durum_chk
  check (onay_durum in ('beklemede','onaylandi','reddedildi'));

-- 2) Admin kontrol helper'ı (rol='admin' VEYA yönetici unvanı)
create or replace function yonetici_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol = 'admin'
       or lower(coalesce(unvan,'')) in ('genel müdür','teknik müdür','yazılım geliştirmeci')
     from kullanicilar where auth_id = auth.uid()),
    false
  );
$$;

-- 3) Onay bekleyenleri getir
create or replace function onay_bekleyen_kullanicilar()
returns setof kullanicilar
language plpgsql stable security definer set search_path = public as $$
begin
  if not yonetici_mi() then
    raise exception 'Yetkisiz: yalnızca yöneticiler onay kuyruğunu görebilir.';
  end if;
  return query
    select * from kullanicilar
    where onay_durum = 'beklemede'
    order by created_at asc nulls last, id asc;
end;
$$;

-- 4) Kullanıcıyı onayla — erişim seviyesine göre tip/rol + yetkiler yazar
create or replace function kullanici_onayla(
  p_id            bigint,
  p_tip           text,
  p_rol           text,
  p_moduller      text[]  default '{}',
  p_musteri_id    bigint  default null,
  p_izinli_turler text[]  default '{}'
)
returns kullanicilar
language plpgsql security definer set search_path = public as $$
declare
  admin_id bigint;
  sonuc kullanicilar;
begin
  if not yonetici_mi() then
    raise exception 'Yetkisiz: yalnızca yöneticiler onaylayabilir.';
  end if;
  if p_tip not in ('zna','musteri') then
    raise exception 'Geçersiz tip: %', p_tip;
  end if;
  if p_rol not in ('admin','personel','musteri') then
    raise exception 'Geçersiz rol: %', p_rol;
  end if;

  select id into admin_id from kullanicilar where auth_id = auth.uid();

  update kullanicilar set
    onay_durum   = 'onaylandi',
    onay_tarihi  = now(),
    onaylayan_id = admin_id,
    red_nedeni   = null,
    tip          = p_tip,
    rol          = p_rol,
    moduller     = coalesce(p_moduller, '{}'),
    izinli_turler= coalesce(p_izinli_turler, '{}'),
    musteri_id   = case when p_tip = 'musteri' then p_musteri_id else null end
  where id = p_id
  returning * into sonuc;

  if sonuc.id is null then
    raise exception 'Kullanıcı bulunamadı: %', p_id;
  end if;
  return sonuc;
end;
$$;

-- 5) Kullanıcıyı reddet
create or replace function kullanici_reddet(p_id bigint, p_neden text default null)
returns kullanicilar
language plpgsql security definer set search_path = public as $$
declare
  sonuc kullanicilar;
begin
  if not yonetici_mi() then
    raise exception 'Yetkisiz: yalnızca yöneticiler reddedebilir.';
  end if;
  update kullanicilar set
    onay_durum = 'reddedildi',
    red_nedeni = p_neden,
    onay_tarihi = now()
  where id = p_id
  returning * into sonuc;
  if sonuc.id is null then
    raise exception 'Kullanıcı bulunamadı: %', p_id;
  end if;
  return sonuc;
end;
$$;

grant execute on function yonetici_mi() to authenticated;
grant execute on function onay_bekleyen_kullanicilar() to authenticated;
grant execute on function kullanici_onayla(bigint, text, text, text[], bigint, text[]) to authenticated;
grant execute on function kullanici_reddet(bigint, text) to authenticated;

notify pgrst, 'reload schema';
