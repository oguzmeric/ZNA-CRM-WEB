-- Güvenlik audit sonrası ORTA-seviye sıkılaştırmalar:
-- A) gorevler RLS: ad string eşleşme yazma yolunda kaldırıldı, sadece id.
-- B) sms_gonderim_log: SELECT admin-only (SMS gövdesinde paylaşım tokenı olabilir).

-- ─── A) gorevler_personel_self yazma yolunu id'ye daralt ────────────────
-- SELECT'te ad eşleşme kalabilir (geriye uyum, eski görevler görünsün),
-- INSERT/UPDATE/DELETE sadece id/ekip eşleşmesiyle olsun.
drop policy if exists "gorevler_personel_self" on gorevler;

-- SELECT: geriye uyumlu (ad/kullanici_adi/id/ekip hepsi kabul)
create policy "gorevler_personel_select" on gorevler
  for select
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan   = (select id::text from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or atanan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  );

-- INSERT: yeni görev oluştururken sadece id/ekip eşleşmesi kabul
-- (olusturan_ad ile create edilebiliyor ama atanan_id doğru id olmalı)
create policy "gorevler_personel_insert" on gorevler
  for insert
  with check (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
      -- olusturan_ad kendi adıysa OK (yeni oluşturma, ad tabanlı sadece burada)
      or olusturan_ad = (select ad from kullanicilar where auth_id = auth.uid() limit 1)
      or olusturan_ad = (select kullanici_adi from kullanicilar where auth_id = auth.uid() limit 1)
    )
  );

-- UPDATE/DELETE: SADECE id/ekip — ad çakışmasıyla başkasının görevine erişim yok
create policy "gorevler_personel_update" on gorevler
  for update
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  )
  with check (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  );

create policy "gorevler_personel_delete" on gorevler
  for delete
  using (
    is_staff() and (
      atanan_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or (select id from kullanicilar where auth_id = auth.uid() limit 1) = any(ekip)
    )
  );

-- ─── B) sms_gonderim_log SELECT policy admin-only ─────────────────────
-- Eski policy her personel görebiliyordu → SMS gövdesindeki paylaşım link
-- token'ları / kişisel bilgiler ifşa oluyor. Sadece admin görsün.
drop policy if exists "sms_log_staff_select" on public.sms_gonderim_log;
create policy "sms_log_admin_select" on public.sms_gonderim_log
  for select using (is_admin());

-- INSERT hâlâ personel açık — servisler kayıt yazabilsin.
-- (mevcut sms_log_staff_insert değişmez)

notify pgrst, 'reload schema';
