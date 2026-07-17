-- 188: Görüşmede "Sadece Yönetici Görsün" — DB SEVİYESİNDE gizleme.
-- UI filtresi yetmez: personel mobil/doğrudan API ile de GÖREMEMELİ (RLS).
-- Admin tanımı = arayüzle aynı mekanizma: kullanicilar.rol = 'admin'.

alter table gorusmeler add column if not exists yalniz_yonetici boolean not null default false;

-- Arayüz admin kontrolü (rol='admin') — SECURITY DEFINER (kullanicilar RLS'inden bağımsız)
create or replace function public.crm_rol_admin_mi()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid() and k.rol = 'admin'
  )
$$;
revoke execute on function public.crm_rol_admin_mi() from anon;
grant execute on function public.crm_rol_admin_mi() to authenticated;

-- SELECT: yalniz_yonetici işaretli satırı yalnız rol=admin görür
-- (mevcut "sadece kendi görüşmeleri" opsiyon davranışı aynen korunur)
drop policy if exists gorusmeler_staff_select on gorusmeler;
create policy gorusmeler_staff_select on gorusmeler for select using (
  is_staff()
  and (yalniz_yonetici = false or crm_rol_admin_mi())
  and (
    (not gorusmeler_sadece_kendi_mi())
    or exists (
      select 1 from unnest(string_to_array(coalesce(gorusmeler.gorusen, ''), ',')) x(ad)
      where trim(both from x.ad) = current_kullanici_ad()
    )
  )
);

-- UPDATE/DELETE: gizli satıra personel dokunamaz; personel flag'i açamaz da
-- (with check ile yalniz_yonetici=true yazmak admin'e özel)
drop policy if exists gorusmeler_staff_update on gorusmeler;
create policy gorusmeler_staff_update on gorusmeler for update
  using (is_staff() and (yalniz_yonetici = false or crm_rol_admin_mi()))
  with check (yalniz_yonetici = false or crm_rol_admin_mi());

drop policy if exists gorusmeler_staff_delete on gorusmeler;
create policy gorusmeler_staff_delete on gorusmeler for delete
  using (is_staff() and (yalniz_yonetici = false or crm_rol_admin_mi()));
