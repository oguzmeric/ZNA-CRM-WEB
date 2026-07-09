-- 123: Kişisel Dokümanlar
-- Her kullanıcı kendi dosya/link'lerini saklar. Görünürlük seçenekleri:
--   sadece_ben  → sadece sahibi
--   herkes      → tüm staff okuyabilir/indirebilir
--   secili      → gorunen_kullanici_idler[] içinde olan staff'lar
-- Kategoriler: sistem/public (kullanici_id NULL) VE kullanıcı-tanımlı
-- (kullanici_id kayıtlıysa sadece kendisi görür).

-- ==================== KATEGORİLER ====================
create table if not exists dokuman_kategorileri (
  id bigserial primary key,
  kullanici_id bigint references kullanicilar(id) on delete cascade,
  isim text not null,
  ikon text,  -- lucide icon adı, opsiyonel
  olusturma_tarih timestamptz not null default now()
);

-- Aynı kullanıcının aynı isimde 2 kategorisi olmasın; public (null) için de
create unique index if not exists dokuman_kat_uq
  on dokuman_kategorileri (coalesce(kullanici_id, 0), lower(isim));

-- Sistem kategorileri (public — hepsinin sahibi NULL)
insert into dokuman_kategorileri (kullanici_id, isim, ikon) values
  (null, 'Yazılım Güncellemeleri', 'RefreshCw'),
  (null, 'Teknik Şartnameler',    'ClipboardList'),
  (null, 'Şirket Sunumları',      'Target'),
  (null, 'Sözleşmeler',           'FileText'),
  (null, 'Diğer',                 'File')
on conflict do nothing;

-- ==================== DOKÜMANLAR ====================
create table if not exists kisi_dokumanlari (
  id bigserial primary key,
  kullanici_id bigint not null references kullanicilar(id) on delete cascade,
  kategori_id bigint references dokuman_kategorileri(id) on delete set null,
  baslik text not null,
  aciklama text,
  tip text not null check (tip in ('dosya','link')),
  -- dosya alanları
  dosya_yolu text,        -- storage path: {kullanici_id}/{uuid}.{ext}
  dosya_ad text,          -- görüntüleme için orijinal ad
  dosya_boyut bigint,     -- byte
  dosya_tip text,         -- mime
  -- link alanı
  link_url text,
  -- görünürlük
  gorunurluk text not null default 'sadece_ben'
    check (gorunurluk in ('sadece_ben','herkes','secili')),
  gorunen_kullanici_idler bigint[] not null default '{}',
  -- audit
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now(),
  -- dosya VEYA link olmalı
  constraint dokuman_tip_dolulukda check (
    (tip = 'dosya' and dosya_yolu is not null)
    or (tip = 'link' and link_url is not null)
  )
);

create index if not exists kisi_dok_kullanici_idx on kisi_dokumanlari (kullanici_id);
create index if not exists kisi_dok_gorunurluk_idx on kisi_dokumanlari (gorunurluk);
create index if not exists kisi_dok_gorunen_gin_idx on kisi_dokumanlari using gin (gorunen_kullanici_idler);
create index if not exists kisi_dok_kategori_idx on kisi_dokumanlari (kategori_id);

-- guncelleme_tarih trigger
create or replace function kisi_dokuman_guncelleme_tetikleyici()
returns trigger language plpgsql as $$
begin new.guncelleme_tarih := now(); return new; end;
$$;
drop trigger if exists kisi_dok_guncelleme_trg on kisi_dokumanlari;
create trigger kisi_dok_guncelleme_trg before update on kisi_dokumanlari
  for each row execute function kisi_dokuman_guncelleme_tetikleyici();

-- ==================== RLS ====================
alter table dokuman_kategorileri enable row level security;
alter table kisi_dokumanlari enable row level security;

-- Public kategorileri (kullanici_id null) tüm staff görür
-- Kendi kategorisini kullanıcı yönetir
drop policy if exists dokuman_kat_read on dokuman_kategorileri;
create policy dokuman_kat_read on dokuman_kategorileri
  for select using (
    is_staff() and (
      kullanici_id is null
      or kullanici_id in (select id from kullanicilar where auth_id = auth.uid())
    )
  );

drop policy if exists dokuman_kat_write on dokuman_kategorileri;
create policy dokuman_kat_write on dokuman_kategorileri
  for all using (
    is_staff() and (
      kullanici_id in (select id from kullanicilar where auth_id = auth.uid())
      -- null (public) kategorileri sadece admin yönetsin
      or (kullanici_id is null and exists (
        select 1 from kullanicilar where auth_id = auth.uid() and rol = 'admin'
      ))
    )
  ) with check (
    is_staff() and (
      kullanici_id in (select id from kullanicilar where auth_id = auth.uid())
      or (kullanici_id is null and exists (
        select 1 from kullanicilar where auth_id = auth.uid() and rol = 'admin'
      ))
    )
  );

-- Sahip her şeyi yapabilir
drop policy if exists kisi_dok_sahip_all on kisi_dokumanlari;
create policy kisi_dok_sahip_all on kisi_dokumanlari
  for all using (
    kullanici_id in (select id from kullanicilar where auth_id = auth.uid())
  );

-- Herkese açık dokümanları tüm staff okur
drop policy if exists kisi_dok_herkes_read on kisi_dokumanlari;
create policy kisi_dok_herkes_read on kisi_dokumanlari
  for select using (
    is_staff() and gorunurluk = 'herkes'
  );

-- Seçili kişilere paylaşılan dokümanları o kişiler okur
drop policy if exists kisi_dok_secili_read on kisi_dokumanlari;
create policy kisi_dok_secili_read on kisi_dokumanlari
  for select using (
    gorunurluk = 'secili'
    and (select id from kullanicilar where auth_id = auth.uid()) = any (gorunen_kullanici_idler)
  );

-- ==================== STORAGE ====================
insert into storage.buckets (id, name, public)
values ('kisi-dokuman', 'kisi-dokuman', false)
on conflict do nothing;

-- Staff yeter (asıl erişim kontrolü DB'de yapılıyor)
drop policy if exists kisi_dokuman_sel on storage.objects;
create policy kisi_dokuman_sel on storage.objects for select
  using (bucket_id = 'kisi-dokuman' and is_staff());
drop policy if exists kisi_dokuman_ins on storage.objects;
create policy kisi_dokuman_ins on storage.objects for insert
  with check (bucket_id = 'kisi-dokuman' and is_staff());
drop policy if exists kisi_dokuman_del on storage.objects;
create policy kisi_dokuman_del on storage.objects for delete
  using (bucket_id = 'kisi-dokuman' and is_staff());

notify pgrst, 'reload schema';
