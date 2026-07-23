-- 228_rls_initplan_genel.sql
-- 227'de gorusmeler için yapılan RLS performans düzeltmesini TÜM tablolara yay.
--
-- Sorun (auth_rls_initplan): RLS politikaları yardımcı fonksiyonları ÇIPLAK
-- çağırdığında Postgres bunları satır-bağımlı sayar ve HER SATIR İÇİN yeniden
-- çalıştırır. Bu fonksiyonların hepsi `kullanicilar` tablosuna auth.uid() ile
-- gidiyor → 12.000 satırlık bir tabloda 12.000 gereksiz alt-sorgu.
--
-- Ölçülen "önce" değerleri (gerçek oturumla, sadece count(*)):
--   servis_raporlari  982 ms
--   aktivite_loglari  457 ms
--   mobiltek_istek_log 97 ms
--   stok_urunler       68 ms
--   (gorusmeler 482 ms idi → mig 227 ile 4 ms'ye indi)
--
-- Çözüm: `is_staff()` → `(select is_staff())`. Postgres bunu satırdan bağımsız
-- görüp InitPlan olarak BİR KEZ hesaplar. Supabase'in RLS performans rehberindeki
-- resmi desen. Mantık AYNEN korunur — kimin neyi gördüğü değişmez.
--
-- Yöntem: politikaları elle yeniden yazmak yerine mevcut ifadeyi okuyup
-- fonksiyon çağrılarını sarıyoruz ve ALTER POLICY ile güncelliyoruz.
-- ALTER POLICY rolleri ve komut tipini KORUR (drop/create riski yok).
-- Zaten sarılmış olanlara lookbehind ile dokunulmuyor → tekrar çalıştırılabilir.

begin;

do $$
declare
  r record;
  v_qual  text;
  v_check text;
  fn      text;
  v_sayac int := 0;
  -- Yalnız PARAMETRESİZ, oturuma bağlı yardımcılar. Satır kolonu alan
  -- fonksiyonlar (varsa) bilerek DIŞARIDA — onlar gerçekten satır-bağımlıdır.
  FNS text[] := array[
    'is_staff', 'is_admin', 'is_personel',
    'crm_rol_admin_mi', 'gorusmeler_sadece_kendi_mi',
    'current_kullanici_id', 'current_kullanici_ad', 'current_musteri_id',
    'current_user_role', 'current_user_profile',
    'ik_yetkili', 'ik_kendi_id',
    'arac_referans_yetkili', 'arac_foto_referans_kilidi',
    'demirbas_yetkili'
  ];
begin
  for r in
    select p.polname::text as ad,
           c.relname::text  as tablo,
           pg_get_expr(p.polqual, p.polrelid)      as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as chk
      from pg_policy p
      join pg_class c     on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
  loop
    v_qual  := r.qual;
    v_check := r.chk;

    foreach fn in array FNS loop
      -- (?<!SELECT ) → zaten sarılmışsa tekrar sarma (idempotent)
      -- \m           → kelime başı; başka fonksiyon adının içine denk gelmesin
      v_qual  := regexp_replace(v_qual,  '(?<!SELECT )\m' || fn || '\(\)',
                                '(SELECT ' || fn || '())', 'g');
      v_check := regexp_replace(v_check, '(?<!SELECT )\m' || fn || '\(\)',
                                '(SELECT ' || fn || '())', 'g');
    end loop;

    -- Değişen yoksa dokunma
    if v_qual is not distinct from r.qual and v_check is not distinct from r.chk then
      continue;
    end if;

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     r.ad, r.tablo, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.ad, r.tablo, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.ad, r.tablo, v_check);
    end if;

    v_sayac := v_sayac + 1;
  end loop;

  raise notice 'RLS initplan sarmalama: % policy guncellendi', v_sayac;
end $$;

-- En cok sorgulanan tablolarda siralama kolonlari icin indeks
-- (liste sorgulari daima bu kolonlarda ORDER BY ... DESC yapiyor)
create index if not exists idx_servis_raporlari_olusturma
  on public.servis_raporlari (olusturma_tarih desc);
create index if not exists idx_aktivite_loglari_olusturma
  on public.aktivite_loglari (olusturma_tarih desc);

commit;
