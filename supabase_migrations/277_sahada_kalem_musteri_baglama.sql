-- 277 — "Sahada ama müşterisi belirsiz" kalemleri servisine bağla (07.08.2026)
--
-- BULGU (sistem nöbetçisi, ilk gün): 148 kalem durum='sahada' ama musteri_id
-- boş. Kullanıcı haklı olarak "bu nasıl belirsiz olur" dedi — gerçekten de
-- belirsiz DEĞİL: 148'in 148'i servis malzemesi satırı üzerinden bir servise
-- bağlı (tamamı TLP-2026-0062 / ELEMENT ELEKTRİK). İzi olmayan tek kayıt yok.
--
-- Gerçek sorun: malzeme serviste kullanılınca kalem 'sahada' işaretleniyor
-- ama kalemin KENDİ kartına müşteri yazılmıyor. Bilgi serviste duruyor,
-- cihaz kartında durmuyor. Sonuç: "bu müşteride hangi cihazlar var?" sorusu
-- cihaz üzerinden cevaplanamıyor, envanter izi kopuk görünüyor.
--
-- Çözüm iki katmanlı: (1) geçmişi servisten doldur, (2) bundan sonra DB
-- trigger'ı otomatik doldursun — istemci atlarsa da kopmasın.

begin;

-- ---------------------------------------------------------------------------
-- 1) Geçmişi bağla — kaynak: kalemin kullanıldığı servisin müşterisi
--    takilma_tarihi de boşsa malzeme satırının tarihinden doldurulur.
-- ---------------------------------------------------------------------------
with kaynak as (
  select
    k.id as kalem_id,
    -- Bir kalem birden fazla serviste geçiyorsa EN SON kullanım esas alınır
    (array_agg(st.musteri_id order by sm.id desc))[1]                  as musteri_id,
    (array_agg(st.talep_no order by sm.id desc))[1]                    as talep_no,
    (array_agg(coalesce(sm.tarih, st.tamamlanma_tarihi) order by sm.id desc))[1] as kullanim_tarihi
  from stok_kalemleri k
  join servis_malzemeleri sm on sm.kalem_id = k.id
  join servis_talepleri  st on st.id = sm.servis_id
  where k.durum = 'sahada'
    and k.musteri_id is null
    and coalesce(k.silindi, false) = false
    and st.musteri_id is not null
  group by k.id
)
update stok_kalemleri k
   set musteri_id     = kay.musteri_id,
       takilma_tarihi = coalesce(k.takilma_tarihi, kay.kullanim_tarihi),
       notlar = case
         when coalesce(k.notlar, '') = '' then 'Servis ' || kay.talep_no || ' ile sahaya çıktı (mig 277).'
         else k.notlar || E'\n' || 'Servis ' || kay.talep_no || ' ile sahaya çıktı (mig 277).'
       end
  from kaynak kay
 where k.id = kay.kalem_id;

-- ---------------------------------------------------------------------------
-- 2) Bundan sonrası: servis malzemesi bir kaleme bağlandığında kalemin
--    müşterisi servisin müşterisinden OTOMATİK dolar.
--    Yalnızca BOŞ alanı doldurur — elle girilmiş müşteriyi ezmez.
-- ---------------------------------------------------------------------------
create or replace function public.kalem_musteriyi_servisten_doldur()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_musteri bigint;
begin
  if new.kalem_id is null or new.servis_id is null then
    return new;
  end if;

  select st.musteri_id into v_musteri
    from servis_talepleri st
   where st.id = new.servis_id;

  if v_musteri is null then
    return new;
  end if;

  -- Sadece boş olanı doldur: mevcut müşteri bilgisi ASLA ezilmez
  update stok_kalemleri
     set musteri_id     = v_musteri,
         takilma_tarihi = coalesce(takilma_tarihi, coalesce(new.tarih, now()))
   where id = new.kalem_id
     and musteri_id is null;

  return new;
end;
$function$;

drop trigger if exists tr_kalem_musteri_servisten on public.servis_malzemeleri;
create trigger tr_kalem_musteri_servisten
  after insert or update of kalem_id, servis_id on public.servis_malzemeleri
  for each row execute function public.kalem_musteriyi_servisten_doldur();

commit;
