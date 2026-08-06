-- 271_fiyat_gizliligi_arka_kapilar.sql
-- Mig 238 teklifler'i kilitledi ama aynı fiyat verisi başka tablolardan hâlâ
-- TÜM personele (teknisyen + saha dahil) SELECT açıktı (06.08 denetimi):
-- siparisler + siparis_kalemleri (birim_fiyat, alis_fiyat = kâr marjı!),
-- on_siparisler + on_siparis_kalemleri (alis_fiyat), fatura_talepleri
-- (ara/kdv/genel_toplam), sozlesmeler, satis_sozlesmeleri, bayi_sozlesmeleri.
--
-- Kapı: mig 238'in teklif_gorebilir() fonksiyonu (admin + 'teklifler' modüllü
-- personel; Abdullah 44 dahil).
--
-- İSTİSNA — akış kırılmasın:
-- * on_siparisler: Salih (34) ve Mahmut (45) depo oldukları için teklif
--   göremezler AMA ön siparişi bizzat AÇIYORLAR. Kendi oluşturdukları ön
--   sipariş + kalemlerine erişimleri sahiplik politikasıyla KORUNUR.
-- * fatura_talepleri: talebi açan (talep_eden_id) kendi talebini görebilir ve
--   açabilir — yalnız kendi yazdığı tutarı görür, başkasınınkini göremez.
--
-- Paylaşım/token akışları (mig 211 vb.) SECURITY DEFINER RPC, Zeyna ve edge
-- fonksiyonları service_role — bu daraltmadan etkilenmezler.

begin;

-- ── siparisler + siparis_kalemleri ─────────────────────────────────────────
drop policy if exists siparisler_staff on siparisler;
create policy siparisler_yetkili_all on siparisler
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

drop policy if exists siparis_kalemleri_staff on siparis_kalemleri;
create policy siparis_kalemleri_yetkili_all on siparis_kalemleri
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

-- ── on_siparisler: yetkili VEYA sahibi ─────────────────────────────────────
drop policy if exists on_siparisler_staff on on_siparisler;
create policy on_siparisler_yetkili_all on on_siparisler
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));
create policy on_siparisler_sahip_all on on_siparisler
  for all to authenticated
  using (olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()))
  with check (olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()));

-- ── on_siparis_kalemleri: parent'ın erişim kuralını izler ──────────────────
drop policy if exists on_siparis_kalemleri_staff on on_siparis_kalemleri;
create policy on_siparis_kalemleri_erisim on on_siparis_kalemleri
  for all to authenticated
  using (exists (
    select 1 from on_siparisler o
    where o.id = on_siparis_kalemleri.on_siparis_id
      and ((select public.teklif_gorebilir())
           or o.olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()))
  ))
  with check (exists (
    select 1 from on_siparisler o
    where o.id = on_siparis_kalemleri.on_siparis_id
      and ((select public.teklif_gorebilir())
           or o.olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()))
  ));

-- ── fatura_talepleri: yetkili VEYA talebi açan ─────────────────────────────
drop policy if exists fatura_talep_all on fatura_talepleri;
create policy fatura_talep_yetkili_all on fatura_talepleri
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));
create policy fatura_talep_sahip_all on fatura_talepleri
  for all to authenticated
  using (talep_eden_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()))
  with check (talep_eden_id = (select k.id from kullanicilar k where k.auth_id = auth.uid()));

-- ── sözleşme tabloları ─────────────────────────────────────────────────────
drop policy if exists sozlesmeler_staff_all on sozlesmeler;
create policy sozlesmeler_yetkili_all on sozlesmeler
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

drop policy if exists satis_soz_all on satis_sozlesmeleri;
create policy satis_soz_yetkili_all on satis_sozlesmeleri
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

drop policy if exists bayi_soz_all on bayi_sozlesmeleri;
create policy bayi_soz_yetkili_all on bayi_sozlesmeleri
  for all to authenticated
  using ((select public.teklif_gorebilir()))
  with check ((select public.teklif_gorebilir()));

commit;

notify pgrst, 'reload schema';
