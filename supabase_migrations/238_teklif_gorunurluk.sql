-- 238 — Teklif görünürlüğü: teknisyen / saha ekibi / depo teklif ve fiyat GÖREMEZ
--
-- Sorun: teklifler tablosunun tek personel politikası `is_staff()` idi; yani
-- CRM'e giren HER personel (12 teknisyen + depo dahil) tüm tekliflerin birim
-- fiyat, iskonto, kâr ve genel toplam bilgisini hem webden hem mobilden
-- okuyabiliyordu. Menüyü gizlemek yetmez — PostgREST üzerinden veri yine gelir.
--
-- Çözüm: yeni 'teklifler' modül anahtarı (kullanicilar.moduller) + teklif_gorebilir()
-- kapısı. Personel Yönetimi > Modül erişimleri ekranından tek tıkla verilip alınır.
-- Web MainLayout menü filtresi, App.jsx TeklifGuard ve mobil MODUL_ESLEME aynı
-- anahtarı kullanır; DB tarafı burasıdır (son savunma hattı).
--
-- Erişim kararı (kullanıcı, 28.07): "teknisyenler ve saha elemanları hariç
-- diğerleri görebilir" + depo sorumluları göremez.

begin;

-- ── 1) Yetki fonksiyonu ────────────────────────────────────────────────────
-- admin rolü (Ali, Oğuz, Ahmet Agun, Ferdi) + 'teklifler' modülü olan personel.
-- Müşteri portal hesapları buradan geçmez; onların kendi politikası ayrı.
create or replace function public.teklif_gorebilir()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select k.rol = 'admin' or ('teklifler' = any(coalesce(k.moduller, '{}'::text[])))
      from kullanicilar k
     where k.auth_id = auth.uid()
       and k.rol in ('admin', 'personel')
     limit 1
  ), false);
$$;

revoke execute on function public.teklif_gorebilir() from anon;
grant execute on function public.teklif_gorebilir() to authenticated, service_role;

-- ── 2) Modül tohumlama ─────────────────────────────────────────────────────
-- Teknisyen / saha / depo unvanlıları HARİÇ, ofis+yönetim kadrosu.
--   1  Ali Uğur Aktepe (Genel Müdür)        2  Oğuz Meriç (Yazılım)
--   23 Sadık Baloğlu (Satış Müdürü)         28 Tarık Altaş
--   29 Ahmet Agun (GM Yrd.)                 30 Hasan Yılmaz (Koordinatör)
--   33 Ferdi Kalkan (Teknik Müdür)          44 Abdullah İğde (Muhasebe Müdürü)
--   59 Irmak İnan
-- Kapsam DIŞI: 31/41/52/53/54/55/56/57/58/60 teknisyen, 34 Salih + 45 Mahmut depo.
update kullanicilar
   set moduller = array_append(coalesce(moduller, '{}'::text[]), 'teklifler')
 where id in (1, 2, 23, 28, 29, 30, 33, 44, 59)
   and not ('teklifler' = any(coalesce(moduller, '{}'::text[])));

-- ── 3) teklifler ───────────────────────────────────────────────────────────
-- Müşteri portalının kendi teklifini görmesi (teklifler_customer_self_select)
-- DEĞİŞMEDEN kalır; yalnız personel kapısı daraltılır.
drop policy if exists teklifler_staff_all on teklifler;
create policy teklifler_yetkili_all on teklifler
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

-- ── 4) esnweb teklif aynası (aynı fiyat verisi) ────────────────────────────
drop policy if exists esn_teklifler_staff_read on esn_teklifler;
create policy esn_teklifler_yetkili_read on esn_teklifler
  for select to authenticated
  using ((select public.teklif_gorebilir()));

drop policy if exists esn_kalem_staff_read on esn_teklif_kalemleri;
create policy esn_kalem_yetkili_read on esn_teklif_kalemleri
  for select to authenticated
  using ((select public.teklif_gorebilir()));

-- ── 5) Teklif çıktı logları (teklif no + firma + kim aldı) ─────────────────
drop policy if exists tcl_sel on teklif_cikti_loglari;
create policy tcl_sel on teklif_cikti_loglari
  for select to authenticated
  using ((select public.teklif_gorebilir()));

drop policy if exists tcl_ins on teklif_cikti_loglari;
create policy tcl_ins on teklif_cikti_loglari
  for insert to authenticated
  with check ((select public.teklif_gorebilir()));

-- ── 6) Teklif şablonları (hazır fiyatlı kalem setleri) ─────────────────────
-- Eski politikalar qual = true idi: giriş yapan herkes okuyup silebiliyordu.
drop policy if exists sablon_select_auth on teklif_sablonlari;
drop policy if exists sablon_insert_auth on teklif_sablonlari;
drop policy if exists sablon_delete_auth on teklif_sablonlari;
create policy sablon_yetkili_all on teklif_sablonlari
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

commit;
