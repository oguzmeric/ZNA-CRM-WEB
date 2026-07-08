-- 108: Teknisyen transit envanter — SN'li stok kalemleri teknisyene zimmet.
-- Servise çıkan teknisyenin yanındaki SN'li ürünleri anlık takip etmek için.
-- Bir stok kalemi (SN) aynı anda tek teknisyende olabilir → aktif kayıt UNIQUE.

create table if not exists teknisyen_envanter (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  stok_kalemi_id uuid not null references stok_kalemleri(id) on delete cascade,
  zimmet_zamani timestamptz not null default now(),
  zimmetleyen_id uuid references kullanicilar(id),
  durum text not null default 'yolda' check (durum in ('yolda', 'kuruldu', 'iade')),
  servis_talebi_id uuid references servis_talepleri(id) on delete set null,
  kuruldu_zamani timestamptz,
  iade_zamani timestamptz,
  not text,
  olusturuldu timestamptz not null default now()
);

-- Aynı kalem aynı anda tek yerde: yolda durumunda unique
create unique index if not exists teknisyen_envanter_aktif_kalem_uq
  on teknisyen_envanter (stok_kalemi_id)
  where durum = 'yolda';

create index if not exists teknisyen_envanter_kullanici_idx
  on teknisyen_envanter (kullanici_id, durum);

alter table teknisyen_envanter enable row level security;

-- Personel kendi kayıtlarını görür; admin hepsini
create policy "teknisyen_envanter_kendi_gorur"
  on teknisyen_envanter for select
  using (
    is_staff() and (
      kullanici_id = auth.uid()
      or exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
    )
  );

-- Insert/update/delete: admin veya kendisi
create policy "teknisyen_envanter_yaz"
  on teknisyen_envanter for all
  using (
    is_staff() and (
      kullanici_id = auth.uid()
      or exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
    )
  )
  with check (
    is_staff() and (
      kullanici_id = auth.uid()
      or exists (select 1 from kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
    )
  );

-- Trigger: durum değişince ilgili zaman kolonu otomatik set
create or replace function teknisyen_envanter_zaman_set()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if new.durum = 'kuruldu' and new.kuruldu_zamani is null then
    new.kuruldu_zamani := now();
  end if;
  if new.durum = 'iade' and new.iade_zamani is null then
    new.iade_zamani := now();
  end if;
  return new;
end;
$$;

drop trigger if exists teknisyen_envanter_zaman_trg on teknisyen_envanter;
create trigger teknisyen_envanter_zaman_trg
  before insert or update on teknisyen_envanter
  for each row execute function teknisyen_envanter_zaman_set();

notify pgrst, 'reload schema';
