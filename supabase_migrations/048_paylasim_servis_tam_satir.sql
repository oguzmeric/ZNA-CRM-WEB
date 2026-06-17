-- Servis raporu artik public sayfada inline render ediliyor (ServisFormu
-- bileseni), arsivlenmis PDF yerine. Bu yuzden RPC tam talep satirini
-- dondurmeli (formun ihtiyaci olan tum alanlar). 044/047'deki kisitli
-- jsonb_build_object geri aliniyor.

create or replace function paylasim_servis_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id   bigint;
  v_belge_tipi text;
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

  select to_jsonb(s.*) into v_result
    from servis_talepleri s
   where s.id = v_belge_id;

  return v_result;
end;
$$;

grant execute on function paylasim_servis_oku(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
