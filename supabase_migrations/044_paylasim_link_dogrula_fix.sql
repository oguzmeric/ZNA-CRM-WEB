-- Fix: paylasim_link_dogrula icinde 'ilk_acilma' kolonu hem tabloda hem
-- RETURN TABLE definition'inda var — PL/pgSQL ambiguous referans hatasi veriyor.
-- Tum tablo erisimlerini 'mp.' alias ile niteleyip ve update ifadesindeki
-- COALESCE'i acik bicimde yaziyoruz.

create or replace function paylasim_link_dogrula(
  in_token text,
  in_ip text default null
)
returns table (
  belge_tipi text,
  belge_id   bigint,
  son_kullanma timestamptz,
  ilk_acilma timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_ilk timestamptz;
  v_belge_tipi text;
  v_belge_id bigint;
  v_son_kullanma timestamptz;
begin
  select mp.id, mp.ilk_acilma, mp.belge_tipi, mp.belge_id, mp.son_kullanma
    into v_id, v_ilk, v_belge_tipi, v_belge_id, v_son_kullanma
    from musteri_paylasim_linkleri mp
   where mp.token = in_token
     and not mp.iptal_edildi
     and mp.son_kullanma > now()
   limit 1;

  if v_id is null then
    return;
  end if;

  update musteri_paylasim_linkleri mp
     set acilma_sayisi = mp.acilma_sayisi + 1,
         son_acilma    = now(),
         ilk_acilma    = coalesce(mp.ilk_acilma, now()),
         acilan_ip     = coalesce(in_ip, mp.acilan_ip)
   where mp.id = v_id;

  belge_tipi   := v_belge_tipi;
  belge_id     := v_belge_id;
  son_kullanma := v_son_kullanma;
  ilk_acilma   := coalesce(v_ilk, now());
  return next;
end;
$$;

grant execute on function paylasim_link_dogrula(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
