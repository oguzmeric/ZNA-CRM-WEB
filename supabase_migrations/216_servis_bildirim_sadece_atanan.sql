-- 216 — Servis talebi bildirimi SADECE atanan kişiye (2026-07-21 talebi:
-- "herkese bildirim gidiyor telefonda, sadece atanan kişiye gitmeli").
--
-- Eski davranış (mig 057/058): TÜM ZNA personeline bildirim → herkesin telefonu
-- çalıyordu. Yeni davranış:
--   • Atanan teknisyen VARSA (atanan_kullanici_id) → yalnız ona bildirim.
--   • Atanan YOKSA (bekleyen / müşteri portal talebi) → yalnız yöneticilere
--     (rol='admin': Ali, Oğuz, Ahmet, Ferdi) — talep kaybolmasın, kim atayacaksa
--     görsün. "Herkes" değil, küçük yönetim seti.
--   • Oluşturan kişi her durumda listeden çıkar (kendi bildirimini almaz).
-- Bildirimler INSERT → tr_bildirim_push → Expo push zinciri aynı kalır.

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
  select id, talep_no, konu, aciklama, alt_kategori, cihaz_turu, ana_tur,
         musteri_ad, firma_adi, kaynak, atanan_kullanici_id, atanan_kullanici_ad
    into v_talep
    from servis_talepleri
   where id = p_talep_id;

  if not found then
    raise exception 'Talep bulunamadi: %', p_talep_id;
  end if;

  v_trassir := (
    coalesce(v_talep.konu, '') ilike '%trassir%' or
    coalesce(v_talep.aciklama, '') ilike '%trassir%' or
    coalesce(v_talep.alt_kategori, '') ilike '%trassir%' or
    coalesce(v_talep.cihaz_turu, '') ilike '%trassir%' or
    coalesce(v_talep.ana_tur, '') ilike '%trassir%'
  );

  v_baslik := case
    when coalesce(v_talep.kaynak, 'personel') = 'musteri' then '📩 Yeni Müşteri Talebi'
    else '🛠️ Yeni Servis Talebi'
  end;
  v_mesaj := concat_ws(' · ',
    nullif(v_talep.talep_no, ''),
    nullif(coalesce(v_talep.firma_adi, v_talep.musteri_ad), ''),
    nullif(v_talep.konu, '')
  );
  v_link := '/servis-talepleri/' || v_talep.id;

  return query
  with adaylar as (
    -- Atanan varsa yalnız o; yoksa yöneticiler (rol='admin')
    select v_talep.atanan_kullanici_id as id
     where v_talep.atanan_kullanici_id is not null
    union
    select k.id
      from kullanicilar k
     where v_talep.atanan_kullanici_id is null
       and k.rol = 'admin'
       and k.tip = 'zna'
       and (k.durum is null or k.durum <> 'pasif')
  ),
  filtreli as (
    select distinct id
      from adaylar
     where id is not null
       and (p_olusturan_id is null or id <> p_olusturan_id)
  ),
  insert_edilen as (
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
    select id, p_olusturan_id, v_baslik, v_mesaj, 'servis_talebi', v_link,
           jsonb_build_object(
             'talepId',  v_talep.id,
             'talepNo',  v_talep.talep_no,
             'trassir',  v_trassir,
             'kaynak',   coalesce(v_talep.kaynak, 'personel')
           )
      from filtreli
    returning bildirimler.id as bildirim_id, bildirimler.alici_id as alici_id
  )
  select bildirim_id, alici_id from insert_edilen;
end;
$$;

notify pgrst, 'reload schema';
select 'MIG 216 OK — servis bildirim sadece atanan (yoksa yonetici)' as sonuc;
