-- 183 — Demirbaş Zimmet: tablo + bucket (109/110'un ÇALIŞAN hali)
--
-- /skor Envanter > Demirbaş "Bucket not found" + "table demirbas_zimmet not
-- found in schema cache" veriyordu. Kök neden: mig 109 hiç UYGULANAMAMIŞTI —
-- kullanici_id "uuid references kullanicilar(id)" yazılmış ama kullanicilar.id
-- BIGINT (tip uyuşmazlığı → migration hata verip düşmüş); RLS'te de
-- k.id = auth.uid() karşılaştırması yanlıştı (doğrusu k.auth_id). mig 110
-- bucket'ı private yapıyordu ama kod getPublicUrl kullanıyor → public olmalı.
--
-- Bu migration ikisinin düzeltilmiş, idempotent halidir. 109/110 tarihsel
-- olarak reposit oda duruyor ama canlıya hiç girmedi.

begin;

create table if not exists demirbas_zimmet (
  id uuid primary key default gen_random_uuid(),
  kullanici_id bigint not null references kullanicilar(id) on delete cascade,
  kategori text not null check (kategori in ('laptop', 'canta', 'alet', 'telefon', 'diger')),
  aciklama text,
  foto_url text,
  verildi_tarih timestamptz not null default now(),
  iade_tarih timestamptz,
  zimmetleyen_id bigint references kullanicilar(id),
  olusturuldu timestamptz not null default now()
);

create index if not exists demirbas_zimmet_kullanici_aktif_idx
  on demirbas_zimmet (kullanici_id) where iade_tarih is null;

alter table demirbas_zimmet enable row level security;

drop policy if exists demirbas_kendi_gorur on demirbas_zimmet;
drop policy if exists demirbas_admin_yaz   on demirbas_zimmet;

-- Personel kendi kayıtlarını görür; admin hepsini (auth.uid() = auth_id eşlemesi!)
create policy demirbas_kendi_gorur
  on demirbas_zimmet for select
  using (
    is_staff() and (
      kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
      or exists (select 1 from kullanicilar k where k.auth_id = auth.uid() and k.rol = 'admin')
    )
  );

-- Yazma: sadece admin (demirbaş zimmet süreci yönetim tarafından)
create policy demirbas_admin_yaz
  on demirbas_zimmet for all
  using (exists (select 1 from kullanicilar k where k.auth_id = auth.uid() and k.rol = 'admin'))
  with check (exists (select 1 from kullanicilar k where k.auth_id = auth.uid() and k.rol = 'admin'));

-- Bucket: PUBLIC (kod getPublicUrl ile gösteriyor)
insert into storage.buckets (id, name, public)
values ('demirbas-foto', 'demirbas-foto', true)
on conflict (id) do update set public = true;

drop policy if exists demirbas_foto_staff_read   on storage.objects;
drop policy if exists demirbas_foto_admin_write  on storage.objects;
drop policy if exists demirbas_foto_admin_delete on storage.objects;

create policy demirbas_foto_staff_read
  on storage.objects for select to authenticated
  using (bucket_id = 'demirbas-foto' and is_staff());

create policy demirbas_foto_admin_write
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'demirbas-foto'
    and exists (select 1 from public.kullanicilar k where k.auth_id = auth.uid() and k.rol = 'admin')
  );

create policy demirbas_foto_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'demirbas-foto'
    and exists (select 1 from public.kullanicilar k where k.auth_id = auth.uid() and k.rol = 'admin')
  );

commit;

notify pgrst, 'reload schema';
