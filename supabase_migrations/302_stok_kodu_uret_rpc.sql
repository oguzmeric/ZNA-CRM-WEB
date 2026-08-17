-- 302 — stok_kodu_uret() RPC: STK kodu DB'de üretilir (istemci sayacı YARIŞIR)
--
-- VAKA (17.08, Sadık): teklif ekranındaki Hızlı Stok Ekle kodu tarayıcıdaki
-- listeden max+1 üretiyordu. Liste bayatsa (ikinci sekme / başka kullanıcının
-- eklemesi / önbellek) üretilen kod DB'de ZATEN VAR → unique ihlali →
-- kullanıcıya "DB hatası". Sadık aynı sabah 10 ürünü sorunsuz eklemişti;
-- kırılma deterministik değil, EŞZAMANLILIK kaynaklı.
-- Ders zaten kayıtlıydı: belge no İSTEMCİDE üretilmez ([[reference_belge_no_trigger]]).
--
-- Not: advisory lock üretimi sıralar ama insert AYRI istekte — kesin güvence
-- istemcideki "çakışırsa taze kodla bir kez yeniden dene" adımıyla birlikte.
-- Mevcut fiili seri STK23423444'te (bozuk büyümüş ama kullanımda); max+1
-- kaldığı yerden devam eder, pad'li eski kodlar (STK0xxxx) da sayılır.

begin;

create or replace function public.stok_kodu_uret()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max bigint;
begin
  if not public.is_staff() then
    raise exception 'yetkisiz';
  end if;
  perform pg_advisory_xact_lock(hashtext('stok_kodu_uret'));
  select coalesce(max((regexp_match(stok_kodu, '^STK0*([0-9]+)$', 'i'))[1]::bigint), 0)
    into v_max
    from public.stok_urunler
   where stok_kodu ~* '^STK[0-9]+$';
  return 'STK' || (v_max + 1)::text;
end;
$$;

revoke all on function public.stok_kodu_uret() from public, anon;
grant execute on function public.stok_kodu_uret() to authenticated;

commit;
