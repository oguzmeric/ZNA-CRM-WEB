-- 214 — Proforma Fatura (fatura_talepleri) yorumları + ekleri
--
-- İSTEK (2026-07-21): Proforma Fatura detayına yorum alanı. Muhasebe müdürü
-- taslak fatura görselini yorum olarak ekler, satış müdürünü @ ile etiketler,
-- onay/görüş alışverişini burada yürütür.
--
-- fatura_talebi_yorumlari = gorusme_yorumlari (mig 184) deseninin birebir
-- kopyası: herkes (staff) okur + kendi adına yorum ekler; kendi yorumunu siler;
-- admin hepsi. dosyalar = [{url,name,type,size}] (public bucket urun-gorselleri,
-- yorum-ekleri/ klasörü — mevcut ekleriYukle akışı).

begin;

create table if not exists fatura_talebi_yorumlari (
  id               uuid primary key default gen_random_uuid(),
  talep_id         bigint not null references fatura_talepleri(id) on delete cascade,
  kullanici_id     bigint references kullanicilar(id) on delete set null,
  yazar_ad         text not null,
  icerik           text not null,
  dosyalar         jsonb not null default '[]',
  duzenlendi       boolean not null default false,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz
);
create index if not exists idx_fatura_talebi_yorumlari_talep
  on fatura_talebi_yorumlari (talep_id, olusturma_tarih);

alter table fatura_talebi_yorumlari enable row level security;

drop policy if exists fatura_talebi_yorumlari_admin      on fatura_talebi_yorumlari;
drop policy if exists fatura_talebi_yorumlari_select     on fatura_talebi_yorumlari;
drop policy if exists fatura_talebi_yorumlari_insert     on fatura_talebi_yorumlari;
drop policy if exists fatura_talebi_yorumlari_update_own on fatura_talebi_yorumlari;
drop policy if exists fatura_talebi_yorumlari_delete_own on fatura_talebi_yorumlari;

create policy fatura_talebi_yorumlari_admin on fatura_talebi_yorumlari
  for all using (is_admin()) with check (is_admin());

create policy fatura_talebi_yorumlari_select on fatura_talebi_yorumlari
  for select using (is_staff());

-- Yorumu yalnız KENDİ adına ekleyebilirsin (impersonation önlenir)
create policy fatura_talebi_yorumlari_insert on fatura_talebi_yorumlari
  for insert with check (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy fatura_talebi_yorumlari_update_own on fatura_talebi_yorumlari
  for update using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy fatura_talebi_yorumlari_delete_own on fatura_talebi_yorumlari
  for delete using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

-- Realtime (gorusme_yorumlari / gorev_yorumlari ile aynı desen)
do $$
begin
  begin
    alter publication supabase_realtime add table fatura_talebi_yorumlari;
  exception when duplicate_object then null;
  end;
end $$;

commit;

notify pgrst, 'reload schema';
select 'MIG 214 OK — fatura_talebi_yorumlari' as sonuc;
