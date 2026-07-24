-- 231_belge_no_triggerlari_definer.sql
-- 230'da gorusme_no_uret için çözülen sınıfın TAMAMINI kapat.
--
-- Belge-no üreten BEFORE INSERT trigger'ları içlerinde
--   select max(<no>) from <tablo> ...
-- yapıyor. SECURITY INVOKER iseler bu MAX çağıranın RLS'ine tabidir; tabloda
-- kullanıcıdan gizlenen bir satır (örn. "yalnız yönetici") sıranın en üstündeyse
-- MAX eksik gelir → üretilen no zaten var → duplicate → "kaydedilemedi".
-- (gorusmeler'de Sadık'ta bu yaşandı, mig 230.)
--
-- Belge numarası GLOBAL bir sayaçtır, kullanıcıya göre değişmez → bu trigger'lar
-- RLS'ten bağımsız, TÜM satırları görerek hesaplamalı = SECURITY DEFINER.
-- gorev_no_ata ve gorusme_akt_no_ata zaten DEFINER; kalan 11'ini hizalıyoruz.
--
-- Yöntem: ALTER FUNCTION ... SECURITY DEFINER — GÖVDE DEĞİŞMEZ, yalnız bayrak
-- çevrilir (yeniden yazma riski yok). search_path hepsinde zaten sabit (mig 224).
-- Bu tablolarda henüz kısıtlayıcı RLS yoksa bile bug LATENT — ileride RLS
-- daraltılınca aktifleşmesin diye şimdiden kapatıyoruz.

begin;

do $$
declare
  v_fn text;
  v_hedefler text[] := array[
    'public.bayi_sozlesme_no_uret()',
    'public.demo_tutanak_no_uret()',
    'public.fatura_talep_no_uret()',
    'public.kesif_no_uret()',
    'public.on_siparis_no_uret()',
    'public.satis_istek_no_uret()',
    'public.satis_sozlesme_no_uret()',
    'public.servis_talep_no_uret()',
    'public.siparis_no_uret()',
    'public.teklif_no_uret()',
    'public.tr_stok_opsiyon_no_uret()'
  ];
begin
  foreach v_fn in array v_hedefler loop
    if to_regprocedure(v_fn) is null then
      raise notice 'atlandi (yok): %', v_fn;
      continue;
    end if;
    execute format('alter function %s security definer', v_fn);
    -- PUBLIC/anon EXECUTE temizliği (mig 224 dersi — trigger fn'i RPC'den çağrılamaz)
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
  end loop;
end $$;

commit;
