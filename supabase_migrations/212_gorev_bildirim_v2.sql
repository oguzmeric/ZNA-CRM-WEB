-- 212: Görev bildirim trigger'ı v2 (mig 199'un yerine geçer).
--
-- İstek (2026-07-21): (1) reddedilen görevde oluşturana bildirim GARANTİ olsun,
-- (2) görevi alan kişi (atanan + ekip) HER durum değişikliğinde bildirim alsın
-- (bildirimler INSERT → tr_bildirim_push → Expo = mobil push otomatik).
--
-- mig 199 'reddedildi'yi "istemci özel bildiriyor" diye hariç tutuyordu ve
-- yalnız OLUŞTURANA bildiriyordu. Artık:
--   • Alıcılar: oluşturan + atanan + ekip[] (aktör hariç, tekilleştirilmiş)
--   • reddedildi DAHİL — kabul reddi (red_sebebi) / onay reddi (onay_notu) ayrımlı
--   • Oluşturan için onay_bekliyor hariç kalır (istemci onaylayıcıya ⏳ atıyor,
--     onaylayıcı çoğunlukla oluşturan — çift olmasın). Atanan/ekip için dahil.
-- İstemcilerdeki salt-durum-değişimi bildirimleri kaldırıldı (çift önleme):
-- web GorevDetay/GorevAkisKarti/Gorevler kanban, mobil GorevDetayScreen.

create or replace function public.gorev_olusturan_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aktor_id bigint;
  v_aktor_ad text;
  v_parcalar text := '';
  v_baslik text;
  v_durum_ad text;
  v_sebep text;
  v_alici bigint;
  v_alicilar bigint[] := '{}';
  v_durum_degisti boolean;
begin
  if new.durum = 'taslak' then return new; end if;

  select id, ad into v_aktor_id, v_aktor_ad
  from kullanicilar where auth_id = auth.uid() limit 1;

  v_durum_degisti := new.durum is distinct from old.durum;

  -- Durum değişimi
  if v_durum_degisti then
    v_durum_ad := case new.durum
      when 'bekliyor' then 'Atandı'
      when 'devam' then 'Devam Ediyor'
      when 'beklemede' then 'Beklemede'
      when 'bilgi_bekleniyor' then 'Bilgi Bekleniyor'
      when 'onay_bekliyor' then 'Onay Bekliyor'
      when 'revize' then 'Revize İstendi'
      when 'tamamlandi' then 'Tamamlandı'
      when 'reddedildi' then 'Reddedildi'
      when 'iptal' then 'İptal Edildi'
      else new.durum end;
    v_parcalar := 'durum → ' || v_durum_ad;
    -- Sebep: red için red_sebebi/onay_notu, diğerleri için durum_sebebi
    v_sebep := case
      when new.durum = 'reddedildi' and new.onay_durumu = 'reddedildi' then new.onay_notu
      when new.durum = 'reddedildi' then new.red_sebebi
      when new.durum_sebebi is distinct from old.durum_sebebi then new.durum_sebebi
      else null end;
    if v_sebep is not null and v_sebep <> '' then
      v_parcalar := v_parcalar || ' (' || left(v_sebep, 120) || ')';
    end if;
  end if;

  -- Bitiş tarihi değişimi (aynı update'te durumla birleşir, tek bildirim)
  if new.son_tarih is distinct from old.son_tarih then
    if v_parcalar <> '' then v_parcalar := v_parcalar || ' · '; end if;
    v_parcalar := v_parcalar || 'bitiş: '
      || coalesce(to_char(old.son_tarih, 'DD.MM.YYYY'), '—')
      || ' → ' || coalesce(to_char(new.son_tarih, 'DD.MM.YYYY'), '—');
  end if;

  if v_parcalar = '' then return new; end if;

  v_baslik := case
    when v_durum_degisti and new.durum = 'reddedildi' and new.onay_durumu = 'reddedildi'
      then '⛔ Görev onayı reddedildi'
    when v_durum_degisti and new.durum = 'reddedildi'
      then '❌ Görev reddedildi'
    when v_durum_degisti and new.durum = 'tamamlandi'
      then '✅ Görev tamamlandı'
    when v_durum_degisti
      then '📋 Görev durumu güncellendi'
    else '📅 Görev tarihi değişti' end;

  -- Alıcı kümesi: atanan + ekip (her değişim) + oluşturan (onay_bekliyor hariç)
  if new.atanan_id is not null then
    v_alicilar := array_append(v_alicilar, new.atanan_id);
  end if;
  if new.ekip is not null then
    v_alicilar := v_alicilar || new.ekip;  -- ekip: bigint[]
  end if;
  if new.olusturan_id is not null
     and not (v_durum_degisti and new.durum = 'onay_bekliyor') then
    v_alicilar := array_append(v_alicilar, new.olusturan_id);
  end if;

  for v_alici in select distinct a from unnest(v_alicilar) as a loop
    if v_aktor_id is not null and v_alici = v_aktor_id then continue; end if;
    insert into bildirimler (alici_id, baslik, mesaj, tip, link)
    values (
      v_alici,
      v_baslik,
      coalesce(new.gorev_no, '') || ' "' || new.baslik || '" — ' || v_parcalar
        || ' (' || coalesce(v_aktor_ad, new.atanan_ad, 'sistem') || ' tarafından)',
      'gorev',
      '/gorevler/' || new.id
    );
  end loop;
  return new;
exception when others then
  -- Bildirim üretimi görev güncellemesini ASLA bozamaz
  raise warning 'gorev_olusturan_bildir: %', sqlerrm;
  return new;
end $$;

-- Trigger adı/tanımı aynı kalır (mig 199) — fonksiyon gövdesi değişti.
drop trigger if exists trg_gorev_olusturan_bildir on gorevler;
create trigger trg_gorev_olusturan_bildir after update on gorevler
  for each row execute function gorev_olusturan_bildir();

notify pgrst, 'reload schema';
select 'MIG 212 OK — gorev bildirim v2: atanan+ekip+olusturan, red dahil' as sonuc;
