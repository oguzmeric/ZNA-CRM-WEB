-- 230_gorusme_no_security_definer.sql
-- BUG: Sadık Baloğlu (ve "yalnız yönetici" görüşmesini göremeyen HERKES) görüşme
-- kaydedemiyor — "görüşme kaydedilemedi". Gerçek hata:
--   duplicate key value violates unique constraint "gorusmeler_gorusme_no_uidx"
--
-- Kök neden: gorusme_no_uret trigger'ı SECURITY INVOKER'dı (kardeşi
-- gorusme_akt_no_ata DEFINER iken). Trigger içindeki
--   select max(gorusme_no) from gorusmeler ...
-- çağıran kullanıcının RLS'ine tabi. Sıranın en üstündeki GRS-2026-002772 bir
-- "yalniz_yonetici" görüşmesi → Sadık onu GÖREMİYOR → gördüğü max 2771 →
-- trigger 002772 üretiyor → o numara (gizli) zaten var → duplicate.
--
-- Yani en üstte kişiye-özel bir görüşme varken kısıtlı kullanıcı bir sonrakini
-- açamıyor. Belge-no üreten trigger'lar RLS'ten BAĞIMSIZ, TÜM satırları görerek
-- max hesaplamalı → SECURITY DEFINER şart (gorusme_akt_no_ata zaten öyle).
--
-- Ek: MAX+1 deseni eşzamanlı iki insert'te de çakışabilir (belge-no dersi,
-- reference_belge_no_trigger). Advisory lock ile seri hale getiriyoruz —
-- görüşme oluşturma seyrek, kilit maliyeti ihmal edilebilir.

begin;

create or replace function public.gorusme_no_uret()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son_no int;
  v_pattern text;
begin
  -- Client zaten verdiyse dokunma
  if new.gorusme_no is not null and new.gorusme_no <> '' then
    return new;
  end if;

  -- Yıl bazında seri kilit — eşzamanlı insert'ler sıraya girer (yarış önlenir).
  perform pg_advisory_xact_lock(hashtext('gorusme_no' || v_yil));

  -- SECURITY DEFINER sayesinde RLS bypass → TÜM satırlar üzerinden gerçek max.
  v_pattern := '^GRS-' || v_yil || '-(\d+)$';
  select coalesce(max(substring(gorusme_no from v_pattern)::int), 0)
    into v_son_no
    from gorusmeler
   where gorusme_no ~ v_pattern;

  new.gorusme_no := 'GRS-' || v_yil || '-' || lpad((v_son_no + 1)::text, 6, '0');
  return new;
end;
$function$;

-- Trigger fonksiyonu — PostgREST'ten RPC olarak çağrılamaz; anon EXECUTE'a gerek yok.
-- Yine de PUBLIC/anon EXECUTE'u temizle (mig 224 dersi: revoke public gerekli).
revoke all on function public.gorusme_no_uret() from public;
revoke all on function public.gorusme_no_uret() from anon;

commit;
