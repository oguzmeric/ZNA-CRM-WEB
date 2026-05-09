-- 031_servis_formu_arsivi.sql
-- Servis formu PDF arşivi: her form üretimini kayıt altına alır.

create table public.servis_formu_arsivi (
  id bigserial primary key,
  servis_id bigint not null references public.servis_talepleri(id) on delete cascade,
  dosya_yolu text not null,
  olusturan_id bigint not null references public.kullanicilar(id),
  boyut_byte integer,
  olusturma_tarih timestamptz not null default now()
);

create index idx_servis_formu_arsivi_servis on public.servis_formu_arsivi(servis_id, olusturma_tarih desc);

alter table public.servis_formu_arsivi enable row level security;

-- Yetkili kullanıcılar (servisi görme yetkisi olanlar) arşive de erişir.
-- Basitçe authenticated rolü; daha sıkı kural gerekirse sonra eklenir.
create policy "auth_select_arsiv" on public.servis_formu_arsivi
  for select to authenticated using (true);

create policy "auth_insert_arsiv" on public.servis_formu_arsivi
  for insert to authenticated with check (true);

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
