-- 239 — Göreve not/yorum yazma: katılımcı olmayan personel de yazabilsin
--
-- Sorun: mobil not, görev satırını GÜNCELLEYEREK yazıyor (gorevler.notlar jsonb).
-- gorevler UPDATE politikası ise yalnız atanan / oluşturan / onaylayıcı / ekip
-- üyesine açık. Oysa SELECT politikası standart görevleri HERKESE açıyor
-- (mig 174 "herkes görür + yorum yapar" kararı) — yorum tarafı yarım kalmış.
-- Sonuç: etiketlenen kişi görevi görüyor ama mobilden yorum yazamıyor
-- (Salih Çakmaklı vakası, 29.07). Web'de sorun yok; orası ayrı bir tabloya
-- (gorev_yorumlari) yazıyor ve o tablonun INSERT politikası tüm personele açık.
--
-- Çözüm: UPDATE politikasını GENİŞLETMİYORUZ — o durumda herkes başkasının
-- görevinin durumunu/tarihini de değiştirebilirdi. Bunun yerine yalnızca
-- `notlar` alanına ekleme yapan SECURITY DEFINER fonksiyon.
--
-- Görünürlük kuralı SELECT politikasıyla birebir aynı: standart görevlere her
-- personel yazabilir; 'yonetici_katilimcilar' gizlilikli görevlere yalnız
-- katılımcılar ve adminler.

begin;

create or replace function public.gorev_not_ekle(
  p_gorev_id  bigint,
  p_metin     text,
  p_foto_urls jsonb default '[]'::jsonb,
  p_dosyalar  jsonb default '[]'::jsonb
)
returns jsonb            -- güncel görev satırı (istemci setGorev için kullanıyor)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kul_id   bigint;
  v_kul_ad   text;
  v_rol      text;
  v_silindi  boolean;
  v_gizlilik text;
  v_not      jsonb;
  v_sonuc    jsonb;
begin
  select id, ad, rol, coalesce(hesap_silindi, false)
    into v_kul_id, v_kul_ad, v_rol, v_silindi
    from kullanicilar
   where auth_id = auth.uid()
   limit 1;

  if v_kul_id is null then raise exception 'Oturum bulunamadı'; end if;
  if v_silindi then raise exception 'Silinmiş hesap not yazamaz'; end if;
  if v_rol not in ('admin', 'personel') then raise exception 'Not yazma yetkin yok'; end if;

  select coalesce(gizlilik, 'standart') into v_gizlilik
    from gorevler where id = p_gorev_id;
  if v_gizlilik is null then raise exception 'Görev bulunamadı'; end if;

  -- Gizli görevde yalnız katılımcı + admin (SELECT politikasının aynısı)
  if v_gizlilik <> 'standart' and not public.is_admin() then
    if not exists (
      select 1 from gorevler g
       where g.id = p_gorev_id
         and (g.atanan_id = v_kul_id or g.olusturan_id = v_kul_id
              or g.onaylayici_id = v_kul_id
              or v_kul_id = any(coalesce(g.ekip, '{}'))
              or v_kul_id = any(coalesce(g.gozlemciler, '{}')))
    ) then
      raise exception 'Bu göreve not yazma yetkin yok';
    end if;
  end if;

  -- Yazar bilgisi SUNUCUDAN — istemci başkasının adına not yazamasın
  v_not := jsonb_build_object(
    'metin',     coalesce(p_metin, ''),
    'kullanici', v_kul_ad,
    'tarih',     to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  if jsonb_array_length(coalesce(p_foto_urls, '[]'::jsonb)) > 0 then
    v_not := v_not || jsonb_build_object('fotoUrls', p_foto_urls);
  end if;
  if jsonb_array_length(coalesce(p_dosyalar, '[]'::jsonb)) > 0 then
    v_not := v_not || jsonb_build_object('dosyalar', p_dosyalar);
  end if;

  update gorevler
     set notlar = coalesce(notlar, '[]'::jsonb) || jsonb_build_array(v_not)
   where id = p_gorev_id
   returning to_jsonb(gorevler.*) into v_sonuc;

  return v_sonuc;
end;
$$;

revoke execute on function public.gorev_not_ekle(bigint, text, jsonb, jsonb) from anon;
grant execute on function public.gorev_not_ekle(bigint, text, jsonb, jsonb) to authenticated;

commit;
