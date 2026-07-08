-- 109: Kalıcı demirbaş zimmeti — laptop, takım çantası, alet vs. teknisyene atama.
-- Fotoğraflı, uzun süreli sahiplenmiş demirbaş. Transit envanterden farklı:
-- - envanter: SN'li stok kalemi, servise gidip biter
-- - demirbaş: kalıcı, iade tarihi gelene dek teknisyende kalır

create table if not exists demirbas_zimmet (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  kategori text not null check (kategori in ('laptop', 'canta', 'alet', 'telefon', 'diger')),
  aciklama text,
  foto_url text,
  verildi_tarih timestamptz not null default now(),
  iade_tarih timestamptz,
  zimmetleyen_id uuid references kullanicilar(id),
  olusturuldu timestamptz not null default now()
);

create index if not exists demirbas_zimmet_kullanici_aktif_idx
  on demirbas_zimmet (kullanici_id) where iade_tarih is null;

alter table demirbas_zimmet enable row level security;

-- Personel kendi kayıtlarını görür; admin hepsini
create policy "demirbas_kendi_gorur"
  on demirbas_zimmet for select
  using (
    is_staff() and (
      kullanici_id = auth.uid()
      or exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
    )
  );

-- Yazma: sadece admin (demirbaş zimmet süreci yönetim tarafından)
create policy "demirbas_admin_yaz"
  on demirbas_zimmet for all
  using (
    exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  )
  with check (
    exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );

notify pgrst, 'reload schema';
