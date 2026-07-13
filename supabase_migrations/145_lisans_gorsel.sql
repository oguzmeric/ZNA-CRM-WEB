-- 145: Trassir lisanslarına görsel ekleme (lisans özeti ekran görüntüsü vb.)
-- Kolon: gorsel_yolu (storage path) + private 'lisans-gorsel' bucket.

alter table trassir_lisanslar add column if not exists gorsel_yolu text;

-- ==================== STORAGE ====================
insert into storage.buckets (id, name, public)
values ('lisans-gorsel', 'lisans-gorsel', false)
on conflict do nothing;

-- Staff yeter (kisi-dokuman ile aynı desen — asıl erişim kontrolü DB'de)
drop policy if exists lisans_gorsel_sel on storage.objects;
create policy lisans_gorsel_sel on storage.objects for select
  using (bucket_id = 'lisans-gorsel' and is_staff());
drop policy if exists lisans_gorsel_ins on storage.objects;
create policy lisans_gorsel_ins on storage.objects for insert
  with check (bucket_id = 'lisans-gorsel' and is_staff());
drop policy if exists lisans_gorsel_del on storage.objects;
create policy lisans_gorsel_del on storage.objects for delete
  using (bucket_id = 'lisans-gorsel' and is_staff());

notify pgrst, 'reload schema';
