-- 158: Teklif çıktı logları — kim, ne zaman, hangi teklifi hangi yolla çıktı aldı.
-- Amaç: dışarıda dolaşan bir çıktının kaynağını izleyebilmek (kullanıcı isteği).
-- Çıktının üzerine de alan kişinin adı basılır (TeklifYazdir footer).

create table if not exists teklif_cikti_loglari (
  id               bigserial primary key,
  teklif_id        bigint references teklifler(id) on delete cascade,
  teklif_no        text,
  kullanici_id     bigint,
  kullanici_ad     text,
  islem            text not null check (islem in ('yazdir','pdf','excel')),
  taslak           boolean not null default false,  -- yönetici onayı yokken alındıysa
  olusturma_tarih  timestamptz not null default now()
);

create index if not exists idx_teklif_cikti_teklif on teklif_cikti_loglari(teklif_id);

alter table teklif_cikti_loglari enable row level security;
drop policy if exists tcl_sel on teklif_cikti_loglari;
create policy tcl_sel on teklif_cikti_loglari for select using (is_staff());
drop policy if exists tcl_ins on teklif_cikti_loglari;
create policy tcl_ins on teklif_cikti_loglari for insert with check (is_staff());
-- Güncelleme/silme yok — log değiştirilemez

notify pgrst, 'reload schema';
