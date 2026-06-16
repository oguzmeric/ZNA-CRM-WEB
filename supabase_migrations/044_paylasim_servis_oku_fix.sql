-- FIX: paylasim_servis_oku, public sayfanin bekledigi alan adlariyla (firma,
-- baslik, cozum_aciklamasi, servis_formu_url) json donmeli. Onceki surum ham
-- servis_talepleri satirini donuyordu (firma_adi/konu...) -> sayfada Firma/Konu
-- bos, "form yok" cikiyordu.
--
-- Ayrica en son arsivlenmis servis formunun (servis_formu_arsivi) public URL'sini
-- ekler. Bunun calismasi icin 'servis-formlari' bucket'i public olmali (asagida).

create or replace function paylasim_servis_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id   bigint;
  v_belge_tipi text;
  v_dosya_yolu text;
  v_result     jsonb;
begin
  select belge_id, belge_tipi into v_belge_id, v_belge_tipi
    from musteri_paylasim_linkleri
   where token = in_token
     and not iptal_edildi
     and son_kullanma > now()
   limit 1;

  if v_belge_id is null or v_belge_tipi <> 'servis_raporu' then
    return null;
  end if;

  -- En son arsivlenmis servis formu (varsa)
  select dosya_yolu into v_dosya_yolu
    from servis_formu_arsivi
   where servis_id = v_belge_id
   order by olusturma_tarih desc
   limit 1;

  -- Sayfanin bekledigi alan adlariyla json kur (toCamel ile camelCase'e doner)
  select jsonb_build_object(
    'id',               s.id,
    'tarih',            s.olusturma_tarihi,
    'firma',            s.firma_adi,
    'baslik',           s.konu,
    'aciklama',         s.aciklama,
    'cozum_aciklamasi', s.yapilan_mudahale,
    'servis_formu_url',
      case when v_dosya_yolu is not null
        then 'https://hcrbwxeuscfibgmchdtt.supabase.co/storage/v1/object/public/servis-formlari/' || v_dosya_yolu
        else null
      end
  ) into v_result
    from servis_talepleri s
   where s.id = v_belge_id;

  return v_result;
end;
$$;

grant execute on function paylasim_servis_oku(text) to anon, authenticated, service_role;

-- Anon musterinin form PDF'ini acabilmesi icin bucket public olmali.
-- (Dosya yollari tahmin edilmesi zor: servis_<id>/<iso-timestamp>.pdf)
update storage.buckets set public = true where id = 'servis-formlari';

notify pgrst, 'reload schema';
