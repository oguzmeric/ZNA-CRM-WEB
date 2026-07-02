-- 069: bildirimler INSERT RLS policy — is_staff() politika içinde çalışmadığı
-- için (SECURITY DEFINER fn bazı Supabase konfigürasyonlarında RLS eval'de
-- güvenilmez), staff kontrolünü inline hale getirdik.
--
-- Semantik aynı: staff kullanıcı (rol IN admin/personel, hesabı silinmemiş)
-- herkese bildirim yazabilir; herkes kendine bildirim yazabilir.
--
-- Neden gerekliydi: Sadık Baloğlu Oğuz Meriç'e görev atadığında bildirim
-- INSERT'i sessizce reject ediliyordu (görev 33/34/36).

drop policy if exists bildirimler_staff_insert on public.bildirimler;

create policy bildirimler_staff_insert on public.bildirimler
  for insert
  to public
  with check (
    -- 1) Kullanıcı kendisi göndermek istiyor (self-notification veya
    --    zaten alici_id kendi kullanıcı id'si)
    alici_id IN (
      SELECT id FROM public.kullanicilar
      WHERE auth_id = auth.uid()
    )
    OR
    -- 2) Gönderen zna personeli/admin — herkese yazabilir
    EXISTS (
      SELECT 1 FROM public.kullanicilar
      WHERE auth_id = auth.uid()
        AND rol IN ('admin', 'personel')
        AND coalesce(hesap_silindi, false) = false
    )
  );

notify pgrst, 'reload schema';
