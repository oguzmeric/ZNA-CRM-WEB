-- 224_guvenlik_anon_execute_search_path.sql
-- Supabase Advisor güvenlik taraması (2026-07-22) sonrası iki düzeltme.
--
-- ── BULGU 1: anon (login'siz) EXECUTE edebilen YAZMA/OKUMA fonksiyonları ──
-- PostgreSQL yeni fonksiyona VARSAYILAN olarak PUBLIC'e EXECUTE verir. `anon` rolü
-- PUBLIC'ten miras aldığı için `revoke ... from anon` TEK BAŞINA YETMEZ —
-- PUBLIC grant'i de kaldırmak gerekir. (Mig 223'te bu hatayı ben yaptım:
-- teklif_olusturan_bul'da anon'dan revoke ettim ama PUBLIC'te açık kaldı.)
--
-- anon key web bundle'ında herkese açıktır — yani internetteki herhangi biri
-- bu fonksiyonları çağırabiliyordu:
--   * mesai_otomatik_kapat()        → TÜM personelin açık mesaisini kapatır (YAZMA)
--   * servis_yedek_parca_yaz(id)    → servis_talepleri.yedek_parcalar UPDATE (YAZMA)
--   * servis_yedek_parca_uret(id)   → malzeme adı/S-N/BİRİM FİYAT/tutar döner (SIZINTI)
--   * teklif_olusturan_bul(teklif)  → personel id döner (düşük, yine de gereksiz)
--
-- Bunların hiçbiri istemciden çağrılmıyor (web+mobil grep: 0 sonuç);
-- mesai_otomatik_kapat yalnız pg_cron'dan (postgres rolü) geliyor.
-- DOKUNULMAYANLAR: RLS helper'ları (is_staff, current_kullanici_id, ik_yetkili vs.),
-- login öncesi fonksiyonlar (giris_*, kullanici_adi_email_cozumle),
-- public paylaşım (paylasim_*) ve kiosk (skor_liderlik) — bunlarda anon ZORUNLU.
--
-- ── BULGU 2: search_path sabitlenmemiş fonksiyonlar (Advisor lint 0011) ──
-- 15 fonksiyonda search_path yoktu (çoğu trigger fn: *_no_uret,
-- *_guncelleme_tetikleyici, gorev_bekleme_saati, tr_kucuk ...).
-- Hiçbiri index ifadesinde kullanılmıyor (kontrol edildi) → inline kaybı riski yok.

begin;

-- ── 1) anon/PUBLIC EXECUTE kaldır (yalnız gerçekten gereksiz olanlardan) ──
do $$
declare
  v_sig text;
  v_hedefler text[] := array[
    'public.mesai_otomatik_kapat()',
    'public.servis_yedek_parca_uret(bigint)',
    'public.servis_yedek_parca_yaz(bigint)',
    'public.teklif_olusturan_bul(public.teklifler)'
  ];
begin
  foreach v_sig in array v_hedefler loop
    -- Fonksiyon yoksa sessiz geç (ortamlar arası uyum)
    if to_regprocedure(v_sig) is null then
      raise notice 'atlandi (yok): %', v_sig;
      continue;
    end if;
    execute format('revoke all on function %s from public', v_sig);
    execute format('revoke all on function %s from anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;
end $$;

-- ── 2) search_path'i olmayan tüm public fonksiyonlara sabitle ──
-- Jenerik: bugünküleri de gelecekte eklenecekleri de aynı kural kapsar.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%'
       )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

commit;
