-- Teklif şablonları — sık kullanılan ürün setleri ("5 kamera + NVR + kablo + montaj")
-- şablon olarak kaydedilir, yeni teklifte tek tıkla satırlara eklenir.
-- satirlar jsonb: teklifler.satirlar ile aynı format (camelCase key'ler:
-- stokKodu, stokAdi, miktar, birim, birimFiyat, iskonto, kdv, alisFiyat).

create table if not exists teklif_sablonlari (
  id              bigserial primary key,
  ad              text not null,
  satirlar        jsonb not null default '[]'::jsonb,
  teklif_tipi     text,
  olusturan       text,
  olusturma_tarih timestamptz not null default now()
);

alter table teklif_sablonlari enable row level security;

-- Şablonlar ekip ortak malı: tüm personel görür/ekler/siler (anon erişemez).
drop policy if exists "sablon_select_auth" on teklif_sablonlari;
create policy "sablon_select_auth" on teklif_sablonlari
  for select to authenticated using (true);

drop policy if exists "sablon_insert_auth" on teklif_sablonlari;
create policy "sablon_insert_auth" on teklif_sablonlari
  for insert to authenticated with check (true);

drop policy if exists "sablon_delete_auth" on teklif_sablonlari;
create policy "sablon_delete_auth" on teklif_sablonlari
  for delete to authenticated using (true);

notify pgrst, 'reload schema';
