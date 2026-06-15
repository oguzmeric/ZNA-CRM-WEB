-- Tokenli paylasim linki ile musterinin (anon) belgeyi (teklif veya servis_talebi)
-- okuyabilmesi icin SECURITY DEFINER RPC'leri. RLS bypass.
--
-- Token gecerli ve son_kullanma > now() ise belgeyi json olarak doner.
-- Aksi halde null doner -> frontend "gecersiz/expired" gosterir.

create or replace function paylasim_teklif_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id bigint;
  v_belge_tipi text;
  v_result jsonb;
begin
  -- Token gecerli mi?
  select belge_id, belge_tipi into v_belge_id, v_belge_tipi
    from musteri_paylasim_linkleri
   where token = in_token
     and not iptal_edildi
     and son_kullanma > now()
   limit 1;

  if v_belge_id is null or v_belge_tipi <> 'teklif' then
    return null;
  end if;

  -- Teklifi getir (RLS bypass — security definer)
  select to_jsonb(t.*) into v_result
    from teklifler t
   where t.id = v_belge_id;

  return v_result;
end;
$$;

create or replace function paylasim_servis_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id bigint;
  v_belge_tipi text;
  v_result jsonb;
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

  -- Servis talep + rapor formu url'sini birlikte doner
  select to_jsonb(s.*) into v_result
    from servis_talepleri s
   where s.id = v_belge_id;

  return v_result;
end;
$$;

grant execute on function paylasim_teklif_oku(text) to anon, authenticated, service_role;
grant execute on function paylasim_servis_oku(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
