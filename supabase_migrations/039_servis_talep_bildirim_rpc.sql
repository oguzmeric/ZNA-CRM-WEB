-- Yeni servis talebi olusunca ilgili personele bildirim olustur.
-- RPC function SECURITY DEFINER ile cagirilir → RLS bypass.
-- Frontend bunu cagirir: supabase.rpc('servis_talebi_bildirim_olustur', { p_talep_id, p_olusturan_id })
--
-- Mantik:
--  - Tum ZNA personeli (tip='zna', durum != 'pasif')
--  - Ferdi Kalkan (id=16) her zaman dahil (zaten ZNA'da var ama garanti)
--  - Oguz Meric (id=2) sadece Trassir keyword'lu taleplerde
--  - Olusturan kendi bildirimini almaz

drop function if exists public.servis_talebi_bildirim_olustur(bigint, bigint);

create function public.servis_talebi_bildirim_olustur(
  p_talep_id bigint,
  p_olusturan_id bigint default null
)
returns table (out_bildirim_id bigint, out_alici_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talep record;
  v_trassir boolean;
  v_baslik text;
  v_mesaj text;
  v_link text;
begin
  -- 1. Talebi cek
  select id, talep_no, konu, aciklama, alt_kategori, cihaz_turu, ana_tur, musteri_ad, firma_adi
    into v_talep
    from servis_talepleri
   where id = p_talep_id;

  if not found then
    raise exception 'Talep bulunamadi: %', p_talep_id;
  end if;

  -- 2. Trassir keyword detection (case-insensitive)
  v_trassir := (
    coalesce(v_talep.konu, '') ilike '%trassir%' or
    coalesce(v_talep.aciklama, '') ilike '%trassir%' or
    coalesce(v_talep.alt_kategori, '') ilike '%trassir%' or
    coalesce(v_talep.cihaz_turu, '') ilike '%trassir%' or
    coalesce(v_talep.ana_tur, '') ilike '%trassir%'
  );

  -- 3. Bildirim metni hazirla
  v_baslik := '🛠️ Yeni Servis Talebi';
  v_mesaj := concat_ws(' · ',
    nullif(v_talep.talep_no, ''),
    nullif(coalesce(v_talep.firma_adi, v_talep.musteri_ad), ''),
    nullif(v_talep.konu, '')
  );
  v_link := '/servis-talepleri/' || v_talep.id;

  -- 4. Alicilar — tum ZNA personeli (durum != pasif), olusturan haric
  -- + Trassir ise Oguz (id=2) dahil; degilse haric (zaten ZNA'da ama yine de explicit)
  return query
  with adaylar as (
    select id
      from kullanicilar
     where tip = 'zna'
       and (durum is null or durum <> 'pasif')
       and (p_olusturan_id is null or id <> p_olusturan_id)
  ),
  filtreli as (
    select id from adaylar
     where id <> 2 or v_trassir  -- Oguz (id=2): sadece Trassir ile ilgiliyse
  ),
  insert_edilen as (
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
    select id, p_olusturan_id, v_baslik, v_mesaj, 'servis_talebi', v_link,
           jsonb_build_object('talepId', v_talep.id, 'talepNo', v_talep.talep_no, 'trassir', v_trassir)
      from filtreli
    returning bildirimler.id as bildirim_id, bildirimler.alici_id as alici_id
  )
  select bildirim_id, alici_id from insert_edilen;
end;
$$;

-- authenticated rolune execute izni
grant execute on function public.servis_talebi_bildirim_olustur(bigint, bigint) to authenticated;
