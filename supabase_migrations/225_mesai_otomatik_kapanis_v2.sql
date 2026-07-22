-- 225_mesai_otomatik_kapanis_v2.sql
-- Mesai modeli değişikliği: "Bitir" butonu kalkıyor, mesai 18:30'da kendiliğinden
-- kapanıyor, Başla butonu 18:30–19:00 arası kilitli.
--
-- Bu migration otomatik kapatma fonksiyonunu 3 noktada düzeltir:
--
-- 1) ESKİ HALİ SADECE AYNI GÜN AÇILANLARI KAPATIYORDU
--    `where (giris_zamani at tz)::date = (now() at tz)::date`
--    Artık 19:00'dan sonra da mesai açılabildiği için, akşam 19:30'da açılan bir
--    kayıt ertesi gün 18:30'da kapatılamıyordu (tarihler farklı) → SONSUZA DEK
--    AÇIK kalırdı. Bitir butonu da olmadığı için kullanıcı bunu düzeltemezdi.
--    Yeni hali: açık olan TÜM kayıtları kapatır.
--
-- 2) not_ ALANI EZİLİYORDU
--    'Ofis dışı: 320m' gibi girişte yazılan not siliniyordu. Artık sona eklenir.
--
-- 3) sure_dakika HESAPLANMIYORDU
--    Fonksiyon yalnız cikis_zamani yazıyordu; süre alanını açıkça dolduruyoruz
--    (trigger da doldursa aynı değeri yazar, zararsız).

begin;

create or replace function public.mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  etkilenen integer;
begin
  update mesai_kayitlari
     set cikis_zamani = now(),
         sure_dakika  = greatest(0, (extract(epoch from (now() - giris_zamani)) / 60)::integer),
         not_ = case
                  when coalesce(not_, '') = '' then 'Otomatik kapatıldı (18:30)'
                  else not_ || ' | Otomatik kapatıldı (18:30)'
                end
   where cikis_zamani is null;

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$$;

revoke all on function public.mesai_otomatik_kapat() from public;
revoke all on function public.mesai_otomatik_kapat() from anon;
grant execute on function public.mesai_otomatik_kapat() to authenticated;
grant execute on function public.mesai_otomatik_kapat() to service_role;

commit;
