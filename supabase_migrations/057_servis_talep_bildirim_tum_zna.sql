-- Oguz (id=2) icin 'sadece Trassir' filter'ini kaldir — kullanici talep etti.
-- Trassir/Karel/diger musteri ozel kurallar ileride yeniden eklenecek.
-- Bu migration sadece filter'i kaldirir, kalan mantik ayni.

create or replace function servis_talebi_bildirim_olustur(
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

  -- 2. Trassir keyword detection (meta'ya yazilir, filter olarak kullanilmaz)
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
  -- Oguz id=2 filter'i KALDIRILDI — tum ZNA alir
  return query
  with adaylar as (
    select id
      from kullanicilar
     where tip = 'zna'
       and (durum is null or durum <> 'pasif')
       and (p_olusturan_id is null or id <> p_olusturan_id)
  ),
  insert_edilen as (
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
    select id, p_olusturan_id, v_baslik, v_mesaj, 'servis_talebi', v_link,
           jsonb_build_object('talepId', v_talep.id, 'talepNo', v_talep.talep_no, 'trassir', v_trassir)
      from adaylar
    returning bildirimler.id as bildirim_id, bildirimler.alici_id as alici_id
  )
  select bildirim_id, alici_id from insert_edilen;
end;
$$;

notify pgrst, 'reload schema';
