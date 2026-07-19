-- 202: Keşif krokileri — sahada boş tuvale çizilen yerleşim planı (2026-07-19 karar).
-- Foto üstü çizimden AYRI: taban boş tuval; duvar/kablo/sembol (K1, N1…) vektörleri
-- veri jsonb'de (web+mobil aynı format, yeniden düzenlenebilir), flatten PNG
-- gorsel_yolu'nda (kesif-foto bucket, {kesifId}/kroki/...) — PDF ve önizleme için.
-- Semboller keşif kalemlerine bağlanabilir (sekil.kalemId).

create table if not exists kesif_krokiler (
  id               bigserial primary key,
  kesif_id         bigint not null references kesifler(id) on delete cascade,
  baslik           text not null default 'Kroki',   -- örn. "Zemin kat", "Dükkan içi"
  veri             jsonb,                            -- { surum: 1, sekiller: [...] }
  gorsel_yolu      text,                             -- flatten PNG storage path
  olusturan_ad     text,
  olusturan_id     bigint,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz
);

create index if not exists kesif_kroki_kesif_idx on kesif_krokiler(kesif_id);

alter table kesif_krokiler enable row level security;

drop policy if exists kesif_kroki_sel on kesif_krokiler;
create policy kesif_kroki_sel on kesif_krokiler
  for select using (is_staff());

drop policy if exists kesif_kroki_ins on kesif_krokiler;
create policy kesif_kroki_ins on kesif_krokiler
  for insert with check (is_staff());

-- Foto ile aynı yetki deseni: düzenleme/silme = ekleyen + admin
drop policy if exists kesif_kroki_upd on kesif_krokiler;
create policy kesif_kroki_upd on kesif_krokiler
  for update using (
    is_admin()
    or olusturan_id is null
    or olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid() limit 1)
  ) with check (is_staff());

drop policy if exists kesif_kroki_del on kesif_krokiler;
create policy kesif_kroki_del on kesif_krokiler
  for delete using (
    is_admin()
    or olusturan_id is null
    or olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid() limit 1)
  );

select 'MIG 202 OK' as sonuc;
