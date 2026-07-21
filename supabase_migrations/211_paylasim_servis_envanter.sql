-- 211: paylasim_servis_oku sonucuna form_malzemeleri eklendi.
--
-- Servis formundaki "Kullanılan Malzeme / Cihaz (Envanter)" tablosu iki
-- kaynaktan beslenir (formEnvanterKalemleri ile aynı mantık):
--   1) servis_malzemeleri durum='kullanildi'      (web Kullanılan Malzemeler kartı)
--   2) servis_kalem_kullanimi durum='kullanildi'  (mobil S/N akışı)
-- Paylaşım sayfası anon çalıştığı için bu tablolara client'tan erişemez —
-- kalemler SECURITY DEFINER RPC içinde toplanıp form_malzemeleri olarak döner.
-- Kalem key'leri bilerek camelCase: web toCamel shallow, iç objelere dokunmaz.

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
  v_malz       jsonb;
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

  select coalesce(jsonb_agg(distinct t.satir), '[]'::jsonb) into v_malz
    from (
      select jsonb_build_object(
               'urunAdi', m.urun_adi, 'stokKodu', m.stok_kodu,
               'seriNo', m.seri_no, 'miktar', m.miktar, 'birim', m.birim) as satir
        from servis_malzemeleri m
       where m.servis_id = v_belge_id and m.durum = 'kullanildi'
      union all
      select jsonb_build_object(
               'urunAdi', coalesce(u.stok_adi || coalesce(' — ' || u.marka, ''), k.stok_kodu, 'Envanter kalemi'),
               'stokKodu', k.stok_kodu, 'seriNo', k.seri_no,
               'miktar', 1, 'birim', 'Adet')
        from servis_kalem_kullanimi kk
        join stok_kalemleri k on k.id = kk.kalem_id
        left join stok_urunler u on u.stok_kodu = k.stok_kodu
       where kk.servis_talep_id = v_belge_id and kk.durum = 'kullanildi'
         -- aynı S/N web kaynağında da varsa tekle (JS formEnvanterKalemleri ile aynı)
         and (k.seri_no is null or k.seri_no not in (
               select m2.seri_no from servis_malzemeleri m2
                where m2.servis_id = v_belge_id
                  and m2.durum = 'kullanildi' and m2.seri_no is not null))
    ) t;

  return v_result || jsonb_build_object('form_malzemeleri', v_malz);
end;
$$;

grant execute on function paylasim_servis_oku(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
