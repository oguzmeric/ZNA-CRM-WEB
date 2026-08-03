-- 253 — Bakım işi atandığında teknik personele bildirim (+ telefona push)
--
-- Sorun: Toplu bakım oluşturulup personele atanıyordu ama HİÇBİR yerde bildirim
-- üretilmiyordu (ne serviste, ne sayfada, ne trigger'da). Personel işi ancak
-- mobilde "Bakım İşlerim" listesini kendi açarsa görüyordu — açması için bir
-- sebebi de yoktu. TB-2026-00001'de atanan Mehmet Akif Erel'e giden bildirim: 0.
--
-- Çözüm DB trigger: istemci nereden yazarsa yazsın (web / mobil / ileride cron)
-- bildirim üretilir. bildirimler'e INSERT zaten tr_bildirim_push'u tetikler,
-- yani telefona push kendiliğinden gider — ayrı bir çağrı gerekmez.

create or replace function public.toplu_bakim_atama_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_aktor_id   bigint;
  v_aktor_ad   text;
  v_baslik     text;
  v_ne_zaman   text;
  v_alici      bigint;
  v_alicilar   bigint[] := '{}';
  v_yeni_atama boolean;
  v_tarih_degisti boolean;
begin
  select id, ad into v_aktor_id, v_aktor_ad
  from kullanicilar where auth_id = auth.uid() limit 1;

  -- "05.08.2026 09:00" / tarih yoksa "tarih belirlenmedi"
  v_ne_zaman := case
    when new.planlanan_tarih is null then 'tarih belirlenmedi'
    else to_char(new.planlanan_tarih, 'DD.MM.YYYY')
         || coalesce(' ' || nullif(new.planlanan_saat, ''), '')
  end;

  if tg_op = 'INSERT' then
    v_yeni_atama := true;
    v_tarih_degisti := false;
  else
    -- Atama değişimi: sorumlu ya da ekip farklıysa YALNIZ yeni gelenler haber alır
    v_yeni_atama := new.teknik_personel_id is distinct from old.teknik_personel_id
                 or new.ekip_ids is distinct from old.ekip_ids;
    v_tarih_degisti := new.planlanan_tarih is distinct from old.planlanan_tarih
                    or new.planlanan_saat is distinct from old.planlanan_saat;
  end if;

  if not v_yeni_atama and not v_tarih_degisti then
    return new;
  end if;

  -- Alıcı kümesi
  if new.teknik_personel_id is not null then
    v_alicilar := array_append(v_alicilar, new.teknik_personel_id);
  end if;
  if new.ekip_ids is not null then
    v_alicilar := v_alicilar || new.ekip_ids;
  end if;

  -- Atama değiştiyse zaten haberi olanları TEKRAR rahatsız etme:
  -- yalnız eski atamada bulunmayanlara gönder.
  if tg_op = 'UPDATE' and v_yeni_atama and not v_tarih_degisti then
    v_alicilar := array(
      select a from unnest(v_alicilar) as a
      where a is distinct from old.teknik_personel_id
        and not (a = any(coalesce(old.ekip_ids, '{}'::bigint[])))
    );
  end if;

  v_baslik := case
    when tg_op = 'INSERT' then '🔧 Yeni bakım işi atandı'
    when v_yeni_atama     then '🔧 Bakım işine atandınız'
    else '📅 Bakım tarihi değişti'
  end;

  for v_alici in select distinct a from unnest(v_alicilar) as a loop
    -- Kendi yaptığı atamayı kendine bildirme
    if v_aktor_id is not null and v_alici = v_aktor_id then continue; end if;
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    values (
      v_alici,
      v_aktor_id,
      v_baslik,
      coalesce(new.tb_no, 'Bakım') || ' · '
        || coalesce(nullif(new.lokasyon_adi, ''), 'lokasyon belirtilmedi')
        || ' · ' || v_ne_zaman,
      'bakim',
      '/bakim-isleri/' || new.id
    );
  end loop;
  return new;
exception when others then
  -- Bildirim üretimi bakım kaydını ASLA bozamaz (görev trigger'ıyla aynı ilke)
  raise warning 'toplu_bakim_atama_bildir: %', sqlerrm;
  return new;
end $$;

drop trigger if exists tr_toplu_bakim_atama_bildir on public.toplu_bakimlar;
create trigger tr_toplu_bakim_atama_bildir
  after insert or update on public.toplu_bakimlar
  for each row execute function public.toplu_bakim_atama_bildir();
