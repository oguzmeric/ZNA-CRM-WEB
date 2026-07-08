-- 103: Kamera canlı izleme audit log
-- Amaç: hangi kullanıcı hangi aracın hangi kanalını ne kadar süre izledi.

create table if not exists public.kamera_izleme_log (
  id bigserial primary key,
  kullanici_id bigint not null references public.kullanicilar(id) on delete restrict,
  arac_id text not null,
  arac_plaka text,
  kanal integer not null,
  baslangic timestamptz not null default now(),
  bitis timestamptz,
  sure_saniye integer,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_kamera_izleme_kullanici
  on public.kamera_izleme_log(kullanici_id, baslangic desc);
create index if not exists idx_kamera_izleme_arac
  on public.kamera_izleme_log(arac_id, baslangic desc);

alter table public.kamera_izleme_log enable row level security;
alter table public.kamera_izleme_log force row level security;

drop policy if exists "kamera_log_staff_all" on public.kamera_izleme_log;
create policy "kamera_log_staff_all" on public.kamera_izleme_log
  for all to authenticated
  using (is_staff())
  with check (is_staff());

revoke all on public.kamera_izleme_log from anon;
grant select, insert, update on public.kamera_izleme_log to authenticated;

notify pgrst, 'reload schema';
