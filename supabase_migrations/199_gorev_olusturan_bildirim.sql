-- 199 — Görevi AÇAN kişiye otomatik bildirim (2026-07-19 talebi):
-- durum değişince (özellikle Tamamlandı) ve bitiş tarihi değişince, değişikliği
-- HANGİ istemci yaparsa yapsın (web/mobil/kanban/gecikme kapısı) oluşturan
-- haberdar olur. bildirimler INSERT'i push zincirini (tr_bildirim_push → Expo)
-- otomatik tetikler.
--
-- Bilinçli hariç tutmalar (istemciler bu durumlara ÖZEL bildirim zaten atıyor,
-- çift bildirim olmasın): durum → 'onay_bekliyor' (⏳ onayınızı bekliyor) ve
-- 'reddedildi' (❌ görev reddedildi). Taslaklar bildirilmez. Aktör oluşturanın
-- kendisiyse bildirilmez.

create or replace function public.gorev_olusturan_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aktor_id bigint;
  v_aktor_ad text;
  v_parcalar text := '';
  v_baslik text;
  v_durum_ad text;
begin
  -- Taslaklar ve oluşturansız kayıtlar kapsam dışı
  if new.olusturan_id is null or new.durum = 'taslak' then return new; end if;

  select id, ad into v_aktor_id, v_aktor_ad
  from kullanicilar where auth_id = auth.uid() limit 1;

  -- Aktör oluşturanın kendisiyse bildirme
  if v_aktor_id is not null and v_aktor_id = new.olusturan_id then return new; end if;

  -- Durum değişimi (onay_bekliyor/reddedildi hariç — istemci özel bildiriyor)
  if new.durum is distinct from old.durum
     and new.durum not in ('onay_bekliyor', 'reddedildi') then
    v_durum_ad := case new.durum
      when 'bekliyor' then 'Atandı'
      when 'devam' then 'Devam Ediyor'
      when 'beklemede' then 'Beklemede'
      when 'bilgi_bekleniyor' then 'Bilgi Bekleniyor'
      when 'revize' then 'Revize İstendi'
      when 'tamamlandi' then 'Tamamlandı'
      when 'iptal' then 'İptal Edildi'
      else new.durum end;
    v_parcalar := 'durum → ' || v_durum_ad;
    if new.durum_sebebi is distinct from old.durum_sebebi and new.durum_sebebi is not null then
      v_parcalar := v_parcalar || ' (' || left(new.durum_sebebi, 80) || ')';
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
    when new.durum = 'tamamlandi' and new.durum is distinct from old.durum
      then '✅ Görevin tamamlandı'
    when new.durum is distinct from old.durum and new.durum not in ('onay_bekliyor', 'reddedildi')
      then '📋 Görev durumu güncellendi'
    else '📅 Görev tarihi değişti' end;

  insert into bildirimler (alici_id, baslik, mesaj, tip, link)
  values (
    new.olusturan_id,
    v_baslik,
    coalesce(new.gorev_no, '') || ' "' || new.baslik || '" — ' || v_parcalar
      || ' (' || coalesce(v_aktor_ad, new.atanan_ad, 'sistem') || ' tarafından)',
    'gorev',
    '/gorevler/' || new.id
  );
  return new;
exception when others then
  -- Bildirim üretimi görev güncellemesini ASLA bozamaz
  raise warning 'gorev_olusturan_bildir: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_gorev_olusturan_bildir on gorevler;
create trigger trg_gorev_olusturan_bildir after update on gorevler
  for each row execute function gorev_olusturan_bildir();

notify pgrst, 'reload schema';
select 'MIG 199 OK — olusturana durum/tarih bildirimi' as sonuc;
