-- 203: teklifler.genel_toplam güvencesi
-- Sorun: bazı kayıt yolları (esnweb aktarımı, eski taslaklar) satirlar'ı yazıp
-- genel_toplam'ı NULL bırakıyor → listede $0,00 görünüyor.
-- Çözüm: BEFORE trigger satirlar'dan toplamı DB'de hesaplar (TeklifDetay.toplamHesapla
-- ile aynı formül: satır net = miktar*birimFiyat*(1-iskonto/100); KDV satır netinden;
-- genel iskonto ara toplamdan düşer, KDV'ye dokunmaz) + mevcut tutarsız kayıtlar backfill.

create or replace function public.teklif_genel_toplam_hesapla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ara numeric := 0;
  v_kdv numeric := 0;
begin
  -- Satır yoksa istemcinin verdiği değere dokunma (yoksa 0'la)
  if new.satirlar is null or jsonb_typeof(new.satirlar) <> 'array'
     or jsonb_array_length(new.satirlar) = 0 then
    new.genel_toplam := coalesce(new.genel_toplam, 0);
    return new;
  end if;

  begin
    select coalesce(sum(net), 0),
           coalesce(sum(net * kdv_oran / 100), 0)
      into v_ara, v_kdv
      from (
        select coalesce(nullif(s->>'miktar','')::numeric, 0)
             * coalesce(nullif(s->>'birimFiyat','')::numeric, 0)
             * (1 - coalesce(nullif(s->>'iskonto','')::numeric, 0) / 100) as net,
               coalesce(nullif(s->>'kdv','')::numeric, 0) as kdv_oran
          from jsonb_array_elements(new.satirlar) s
      ) x;
    new.genel_toplam := round(v_ara - v_ara * coalesce(new.genel_iskonto, 0) / 100 + v_kdv, 2);
  exception when others then
    -- bozuk satır verisi kaydı ENGELLEMESİN — istemci değeri kalsın
    new.genel_toplam := coalesce(new.genel_toplam, 0);
  end;
  return new;
end;
$$;

drop trigger if exists trg_teklif_genel_toplam on public.teklifler;
create trigger trg_teklif_genel_toplam
  before insert or update of satirlar, genel_iskonto on public.teklifler
  for each row execute function public.teklif_genel_toplam_hesapla();

-- Backfill: toplamı NULL/0 olup satırlarında fiyat bulunan kayıtları hesapla
update public.teklifler t
   set genel_toplam = sub.gt
  from (
    select y.id,
           round(y.ara - y.ara * coalesce(y.genel_iskonto, 0) / 100 + y.kdv, 2) as gt
      from (
        select t2.id, t2.genel_iskonto,
               coalesce(sum(
                 coalesce(nullif(s->>'miktar','')::numeric, 0)
               * coalesce(nullif(s->>'birimFiyat','')::numeric, 0)
               * (1 - coalesce(nullif(s->>'iskonto','')::numeric, 0) / 100)
               ), 0) as ara,
               coalesce(sum(
                 coalesce(nullif(s->>'miktar','')::numeric, 0)
               * coalesce(nullif(s->>'birimFiyat','')::numeric, 0)
               * (1 - coalesce(nullif(s->>'iskonto','')::numeric, 0) / 100)
               * coalesce(nullif(s->>'kdv','')::numeric, 0) / 100
               ), 0) as kdv
          from public.teklifler t2
         cross join lateral jsonb_array_elements(coalesce(t2.satirlar, '[]'::jsonb)) s
         where coalesce(t2.genel_toplam, 0) = 0
         group by t2.id, t2.genel_iskonto
      ) y
  ) sub
 where t.id = sub.id
   and coalesce(t.genel_toplam, 0) = 0
   and sub.gt <> 0;

-- Doğrulama çıktısı
select count(*) filter (where genel_toplam is null) as hala_null,
       count(*) filter (where coalesce(genel_toplam,0) = 0) as sifir_kalan,
       count(*) as toplam_teklif
  from public.teklifler;
