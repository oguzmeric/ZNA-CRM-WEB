-- 101: Cihaz envanteri + kurulum tarihçesi
-- Amaç: Teknisyen seri_takipli ürünü kurduğunda IP/MAC/kullanıcı adı/şifre gibi
-- cihaz bilgilerini kayıt altına alır. Cihaz sökülüp başka yere taşındığında
-- eski kayıt 'sokuldu' işaretlenir, yeni kayıt açılır.
--
-- Bir S/N aynı anda tek bir yerde 'aktif' olabilir (partial unique index).

create table if not exists public.cihaz_kayitlari (
  id bigserial primary key,

  -- İlişkiler
  stok_kalemi_id bigint not null references public.stok_kalemleri(id) on delete restrict,
  servis_talep_id bigint references public.servis_talepleri(id) on delete set null,
  musteri_id bigint not null references public.musteriler(id) on delete restrict,

  -- Cihaz bilgileri (zorunlu)
  ip_adresi text not null,
  mac_adresi text not null,
  kullanici_adi text not null,
  sifre text not null,

  -- Opsiyonel bilgiler
  port integer,
  lokasyon_notu text,       -- "3. kat depo NVR" gibi
  model_notu text,
  kurulum_notu text,

  -- Kurulum meta
  kuran_kullanici_id bigint not null references public.kullanicilar(id) on delete restrict,
  kurulum_tarihi timestamptz not null default now(),

  -- Durum + sökme
  durum text not null default 'aktif'
    check (durum in ('aktif', 'sokuldu', 'ariza')),
  sokum_tarihi timestamptz,
  sokum_servis_talep_id bigint references public.servis_talepleri(id) on delete set null,
  sokum_kullanici_id bigint references public.kullanicilar(id) on delete set null,
  sokum_notu text,

  -- Audit
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now(),

  -- Bir S/N aynı anda tek yerde aktif olabilir
  constraint cihaz_kayit_sokum_meta_ile check (
    (durum = 'aktif' and sokum_tarihi is null)
    or (durum in ('sokuldu', 'ariza') and sokum_tarihi is not null)
  )
);

-- Unique partial: bir stok_kalemi_id için sadece bir 'aktif' kayıt olabilir
create unique index if not exists cihaz_kayit_aktif_unique
  on public.cihaz_kayitlari(stok_kalemi_id)
  where durum = 'aktif';

-- Aramalar için index'ler
create index if not exists idx_cihaz_kayit_musteri
  on public.cihaz_kayitlari(musteri_id, durum);
create index if not exists idx_cihaz_kayit_stok_kalemi_tarih
  on public.cihaz_kayitlari(stok_kalemi_id, kurulum_tarihi desc);
create index if not exists idx_cihaz_kayit_servis_talep
  on public.cihaz_kayitlari(servis_talep_id);

-- guncelleme_tarihi trigger
create or replace function public.trg_cihaz_kayit_guncelleme_tarihi()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.guncelleme_tarihi := now();
  return new;
end;
$$;

drop trigger if exists cihaz_kayit_guncelleme_tarihi on public.cihaz_kayitlari;
create trigger cihaz_kayit_guncelleme_tarihi
  before update on public.cihaz_kayitlari
  for each row
  execute function public.trg_cihaz_kayit_guncelleme_tarihi();

-- RLS: staff-only
alter table public.cihaz_kayitlari enable row level security;
alter table public.cihaz_kayitlari force row level security;

drop policy if exists "cihaz_kayit_staff_all" on public.cihaz_kayitlari;
create policy "cihaz_kayit_staff_all" on public.cihaz_kayitlari
  for all to authenticated
  using (is_staff())
  with check (is_staff());

-- Anon erişimini engelle (migration 093 default'u ama açıkça revoke edelim)
revoke all on public.cihaz_kayitlari from anon;
grant select, insert, update, delete on public.cihaz_kayitlari to authenticated;

-- PostgREST cache reload
notify pgrst, 'reload schema';
