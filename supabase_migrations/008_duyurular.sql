-- =====================================================================
-- Duyurular — müşteri portalına gösterilen sistem duyuruları
-- =====================================================================
-- Admin/personel yönetir, müşteriler aktif + tarih aralığındakileri okur.
-- =====================================================================

-- 1. Tablo
create table if not exists duyurular (
  id bigserial primary key,
  baslik text not null,
  icerik text,
  seviye text not null default 'info',         -- 'info' | 'warning' | 'success'
  aktif boolean not null default true,
  baslangic_tarihi timestamptz default now(),
  bitis_tarihi timestamptz,                    -- null → süresiz
  olusturan bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz default now(),
  guncelleme_tarih timestamptz default now()
);

create index if not exists idx_duyurular_aktif on duyurular(aktif);
create index if not exists idx_duyurular_tarih on duyurular(baslangic_tarihi desc);

-- 2. RLS
alter table duyurular enable row level security;
alter table duyurular force row level security;

drop policy if exists "duyurular_staff_all" on duyurular;
drop policy if exists "duyurular_customer_read" on duyurular;

-- Personel/admin: tam yetki
create policy "duyurular_staff_all" on duyurular
  for all using (is_staff()) with check (is_staff());

-- Müşteri: sadece aktif + tarih aralığı geçerli olanları okur
create policy "duyurular_customer_read" on duyurular
  for select using (
    aktif = true
    and baslangic_tarihi <= now()
    and (bitis_tarihi is null or bitis_tarihi >= now())
  );

-- 3. guncelleme_tarih otomatik
create or replace function duyurular_touch()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists trg_duyurular_touch on duyurular;
create trigger trg_duyurular_touch
  before update on duyurular
  for each row execute function duyurular_touch();
