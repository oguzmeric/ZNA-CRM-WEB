-- 324 — BORDRO & MAAŞ GİZLİLİĞİ (22.08 kullanıcı kararı: "burası çok kritik")
--
-- İSTEK: "İK tarafında bordro yönetimini admin olarak Ali ve ben yetki verebilelim;
--         bordroları başka kimsenin görmemesi gerek."
--
-- ÖNCEKİ DURUM: bordrolar / personel_maaslari politikaları ik_yetkili() ve
-- ik_puantaj_yetkili() ile korunuyordu; ikisi de AYNI 'ik_yonetim' modülüne bakıyor.
-- Bu modül 3 kişide: 1 (Ali), 2 (Oğuz), 44 (Abdullah İğde — Muhasebe müdürü).
-- Yani 17 kişilik bordro ve 8 maaş kaydı üç kişiye açıktı.
--
-- YENİ DURUM: bordro/maaş için AYRI ve DAR bir anahtar — 'bordro_yonetim'.
--   * Yalnız 1 (Ali) ve 2 (Oğuz) alır.
--   * rol='admin' BYPASS EDEMEZ (Ferdi 33, Ahmet 29 admin ama bordro göremez) —
--     ik_yetkili() deseninin aynısı, bilinçli.
--   * Personelin KENDİ bordrosunu görmesi KORUNUR (/izin-bordro > Bordrolarım).
--   * İzin / avans / personel sicil 'ik_yonetim'de KALIR → Abdullah bu işleri
--     yapmaya devam eder, yalnız bordro ve maaş rakamları ona kapanır.
--   * Puantaj ayar/düzeltme kayıtları da 'ik_yonetim'de kalır (mesai verisi);
--     puantajdaki MAAŞ rakamı personel_maaslari'ndan geldiği için o kapanır.

-- ── 1) Yetki fonksiyonu ──────────────────────────────────────────────────────
create or replace function public.bordro_yetkili()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.kullanicilar k
     where k.auth_id = auth.uid()
       and coalesce(k.hesap_silindi, false) = false
       and coalesce(k.tip, '') = 'zna'                     -- portal hesabı asla
       and 'bordro_yonetim' = any(coalesce(k.moduller, '{}'))
  );
$function$;

comment on function public.bordro_yetkili() is
  'Bordro + maaş erişimi (mig 324). SADECE bordro_yonetim modülü; admin rolü bypass EDEMEZ.';

revoke all on function public.bordro_yetkili() from anon;
grant execute on function public.bordro_yetkili() to authenticated;

-- ── 2) Anahtarı yalnız Ali (1) ve Oğuz (2) alır ──────────────────────────────
update kullanicilar
set moduller = array(select distinct unnest(coalesce(moduller, '{}') || array['bordro_yonetim']))
where id in (1, 2)
  and not ('bordro_yonetim' = any(coalesce(moduller, '{}')));

-- Güvenlik ağı: başka birinde varsa (elle/yanlış yazma) temizle
update kullanicilar
set moduller = array(select unnest(coalesce(moduller, '{}')) except select 'bordro_yonetim')
where id not in (1, 2)
  and 'bordro_yonetim' = any(coalesce(moduller, '{}'));

-- ── 3) bordrolar: kendi bordrosu KORUNUR, yönetim daralır ────────────────────
drop policy if exists bordro_sel on bordrolar;
create policy bordro_sel on bordrolar
  for select to authenticated
  using (kullanici_id = (select public.ik_kendi_id()) or (select public.bordro_yetkili()));

drop policy if exists bordro_ins on bordrolar;
create policy bordro_ins on bordrolar
  for insert to authenticated
  with check ((select public.bordro_yetkili()));

drop policy if exists bordro_upd on bordrolar;
create policy bordro_upd on bordrolar
  for update to authenticated
  using ((select public.bordro_yetkili()))
  with check ((select public.bordro_yetkili()));

drop policy if exists bordro_del on bordrolar;
create policy bordro_del on bordrolar
  for delete to authenticated
  using ((select public.bordro_yetkili()));

-- ── 4) personel_maaslari: maaş rakamı yalnız bordro yetkilisinde ─────────────
drop policy if exists personel_maaslari_ik on personel_maaslari;
create policy personel_maaslari_bordro on personel_maaslari
  for all to authenticated
  using ((select public.bordro_yetkili()))
  with check ((select public.bordro_yetkili()));

comment on table bordrolar is
  'Bordro dosyaları. RLS (mig 324): kişi KENDİ bordrosunu görür; başkasınınki yalnız bordro_yonetim modülünde (Ali, Oğuz). Admin bypass YOK.';
comment on table personel_maaslari is
  'Maaş kayıtları. RLS (mig 324): yalnız bordro_yonetim modülü. Admin bypass YOK, ik_yonetim yetmez.';
