-- 226_demirbas_yetkilisi.sql
-- BUG: Salih (34) ve Mahmut (45) /skor > Demirbaşlar sekmesinde HİÇBİR kayıt göremiyor.
--
-- Kök neden: bugün (c299504) yetkiyi YALNIZ ARAYÜZDE verdim (zimmetYetki.js),
-- veritabanı tarafına dokunmadım. İkisinin de `kullanicilar.rol` değeri 'personel';
-- demirbas_zimmet üzerindeki RLS ise admin'e göre yazılmıştı:
--
--   demirbas_kendi_gorur (SELECT): is_staff() AND (kullanici_id = kendi_id OR rol='admin')
--       → Mahmut yalnız KENDİ demirbaşını görür; teknisyenlere verdiği kayıtlar
--         başka kullanıcılara ait olduğu için listeye hiç düşmez. Panel demirbaş
--         listesinden teknisyenleri türettiği için "teknisyenler de yok" görünür.
--   demirbas_admin_yaz (ALL):     rol='admin'
--       → Mahmut INSERT/UPDATE/DELETE de yapamıyordu.
--
-- Ders (bkz. reference_admin_iki_mekanizma): bu projede yetki İKİ yerde yaşıyor —
-- arayüz kontrolü + DB RLS. Birini değiştirip diğerini unutmak, kullanıcıya
-- "buton var ama liste boş" şeklinde sessizce yansıyor.
--
-- Çözüm: sabit ID listesi yerine kullanicilar üzerinde bayrak
-- (teklif_onay_yetkilisi / fatura_yetkilisi / montaj_sorumlusu ile aynı desen).
-- Böylece ileride yeni kişiye yetki vermek kod değişikliği değil, veri değişikliği.
--
-- NOT: stok_kalemleri (Envanter sekmesi) zaten `is_staff()` ile açıktı —
-- orada sorun yoktu, sadece demirbaş tarafı kapalıydı.

begin;

-- 1) Bayrak
alter table public.kullanicilar
  add column if not exists demirbas_yetkilisi boolean not null default false;

comment on column public.kullanicilar.demirbas_yetkilisi is
  'Demirbaş/envanter zimmetini işletebilir (tüm kayıtları görür + yazar). Admin zaten yetkili.';

-- Salih Çakmaklı (Depo Sorumlusu) + Mahmut Sari (Depocu)
update public.kullanicilar set demirbas_yetkilisi = true where id in (34, 45);

-- 2) Tek kaynak yetki fonksiyonu — admin VEYA bayraklı
create or replace function public.demirbas_yetkili()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.kullanicilar k
     where k.auth_id = auth.uid()
       and coalesce(k.hesap_silindi, false) = false
       and (k.rol = 'admin' or coalesce(k.demirbas_yetkilisi, false))
  );
$$;

-- Grant deseni is_staff() ile aynı (RLS içinde kullanılıyor, anon'a gerek yok).
-- DİKKAT: PUBLIC varsayılan EXECUTE'u da kaldırılmalı — yalnız anon'dan revoke YETMEZ (mig 224 dersi).
revoke all on function public.demirbas_yetkili() from public;
revoke all on function public.demirbas_yetkili() from anon;
grant execute on function public.demirbas_yetkili() to authenticated;
grant execute on function public.demirbas_yetkili() to service_role;

-- 3) Policy'leri yetki fonksiyonuna bağla
drop policy if exists demirbas_kendi_gorur on public.demirbas_zimmet;
create policy demirbas_kendi_gorur on public.demirbas_zimmet
  for select
  using (
    is_staff()
    and (
      kullanici_id = (select k.id from public.kullanicilar k where k.auth_id = auth.uid() limit 1)
      or public.demirbas_yetkili()
    )
  );

drop policy if exists demirbas_admin_yaz on public.demirbas_zimmet;
drop policy if exists demirbas_yetkili_yaz on public.demirbas_zimmet;
create policy demirbas_yetkili_yaz on public.demirbas_zimmet
  for all
  using (public.demirbas_yetkili())
  with check (public.demirbas_yetkili());

commit;
