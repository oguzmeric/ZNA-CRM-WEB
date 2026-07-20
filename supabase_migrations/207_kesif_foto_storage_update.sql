-- 207: kesif-foto bucket'ına eksik UPDATE policy'si
-- Kök neden: kroki düzenle→kaydet PNG'yi AYNI yola upsert eder (storage UPDATE);
-- bucket'ta yalnız SELECT/INSERT/DELETE policy'si vardı → "new row violates
-- row-level security policy". Yeni kroki (INSERT) çalışıyordu, düzenleme patlıyordu.
-- Aynı risk foto çizimi yeniden kaydetmede de vardı (cizim yolu upsert).

drop policy if exists kesif_foto_upd on storage.objects;
create policy kesif_foto_upd on storage.objects
  for update
  using (bucket_id = 'kesif-foto' and is_staff())
  with check (bucket_id = 'kesif-foto' and is_staff());

select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'kesif_foto%'
order by policyname;
