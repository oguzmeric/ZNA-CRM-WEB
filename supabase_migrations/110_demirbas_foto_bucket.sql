-- 110: Demirbaş fotoğrafları için storage bucket.
-- Private bucket; sadece auth'lu staff yazar/okur, RLS policy ile.

insert into storage.buckets (id, name, public)
values ('demirbas-foto', 'demirbas-foto', false)
on conflict (id) do nothing;

-- Read: authenticated staff
create policy "demirbas_foto_staff_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'demirbas-foto' and is_staff());

-- Write (upload): authenticated admin
create policy "demirbas_foto_admin_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'demirbas-foto'
    and exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );

-- Delete: admin
create policy "demirbas_foto_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'demirbas-foto'
    and exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );
