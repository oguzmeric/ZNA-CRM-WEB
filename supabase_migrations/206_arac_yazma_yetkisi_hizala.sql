-- 206: sirket_araclari yazma yetkisi — filoGorebilirMi (istemci) ile HİZALA.
-- Sorun: Abdullah İğde (44) Araç Yönetimi sayfasını görüyor (filo yetkisi 2026-07-17'de
-- verildi) ama RLS yazma politikası eski kalmış (yalnız admin + oğuz/ali/ferdi adları)
-- → ekleme "güvenlik politikası ihlali" hatası, güncelleme/silme SESSİZCE 0 satır.
-- Fix: Ahmet Agun (29) ve Abdullah İğde (44) id'leri politikaya eklendi.

drop policy if exists arac_yonetim_yazar on public.sirket_araclari;
create policy arac_yonetim_yazar on public.sirket_araclari for all
  using (
    exists (
      select 1 from kullanicilar
      where auth_id = auth.uid()
        and (
          rol = 'admin'
          or ad ~* '\m(oğuz|oguz|ali|ferdi)\M'
          or id in (29, 44) -- filoYetki.js IZINLI_KULLANICI_IDLERI ile aynı
        )
    )
  );

notify pgrst, 'reload schema';
select 'mig 206 tamam' as durum;
