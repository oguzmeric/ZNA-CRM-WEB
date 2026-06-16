-- servis_formu_url'yi kendi domain uzerinden sun: supabase.co yerine
-- talep.znateknoloji.com/dosya/... (vercel.json'daki /dosya/:path* proxy'si
-- bunu Supabase storage'a yonlendiriyor). Musteri artik supabase.co gormuyor.

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

  select dosya_yolu into v_dosya_yolu
    from servis_formu_arsivi
   where servis_id = v_belge_id
   order by olusturma_tarih desc
   limit 1;

  select jsonb_build_object(
    'id',               s.id,
    'tarih',            s.olusturma_tarihi,
    'firma',            s.firma_adi,
    'baslik',           s.konu,
    'aciklama',         s.aciklama,
    'cozum_aciklamasi', s.yapilan_mudahale,
    'servis_formu_url',
      case when v_dosya_yolu is not null
        then 'https://talep.znateknoloji.com/dosya/' || v_dosya_yolu
        else null
      end
  ) into v_result
    from servis_talepleri s
   where s.id = v_belge_id;

  return v_result;
end;
$$;

grant execute on function paylasim_servis_oku(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
